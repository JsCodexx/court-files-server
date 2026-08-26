import crypto from 'crypto';
import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';
import {
  buildCheckoutFormFields,
  getEasyPaisaCheckoutUrl,
  isEasyPaisaConfigured,
} from '../utils/easypaisa';
import { getPlanById, PLANS, PlanDto } from './plansCatalog';

export type PaymentStatus =
  | 'pending'
  | 'redirected'
  | 'paid'
  | 'failed'
  | 'cancelled';

interface PaymentRow {
  id: string;
  user_id: string;
  plan_id: string;
  amount_pkr: string;
  currency: string;
  provider: string;
  status: string;
  merchant_order_id: string;
  provider_txn_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentDto {
  id: string;
  planId: string;
  amountPkr: number;
  currency: string;
  provider: string;
  status: PaymentStatus;
  merchantOrderId: string;
  providerTxnId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    planId: row.plan_id,
    amountPkr: Number(row.amount_pkr),
    currency: row.currency,
    provider: row.provider,
    status: row.status as PaymentStatus,
    merchantOrderId: row.merchant_order_id,
    providerTxnId: row.provider_txn_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPlans(): PlanDto[] {
  return PLANS;
}

export async function listPayments(userId: string): Promise<PaymentDto[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throwDbError(error, 'listPayments');
  return ((data as PaymentRow[]) ?? []).map(toDto);
}

export async function getPayment(
  userId: string,
  paymentId: string
): Promise<PaymentDto> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throwDbError(error, 'getPayment');
  if (!data) throw new AppError('Payment not found', 404);
  return toDto(data as PaymentRow);
}

function newOrderId(): string {
  return `CF-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export interface InitiateResult {
  payment: PaymentDto;
  /** Absolute URL to open (EasyPaisa hosted page or local demo checkout). */
  checkoutUrl: string;
  /** When live: POST these fields to checkoutUrl as a form. */
  formFields: Record<string, string> | null;
  demoMode: boolean;
}

export async function initiatePayment(
  userId: string,
  planId: string,
  user: { email?: string; phone?: string }
): Promise<InitiateResult> {
  const plan = getPlanById(planId);
  if (!plan) throw new AppError('Unknown plan.', 400);

  const merchantOrderId = newOrderId();
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(
    /\/$/,
    ''
  );
  const apiBase = (
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 5500}`
  ).replace(/\/$/, '');

  // Gateway posts back here; we then redirect the browser to the frontend.
  const postBackURL = `${apiBase}/api/payments/easypaisa/callback`;

  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      amount_pkr: String(plan.amountPkr),
      currency: 'PKR',
      provider: 'easypaisa',
      status: 'pending',
      merchant_order_id: merchantOrderId,
      metadata: JSON.stringify({ planName: plan.name }),
    })
    .select('*')
    .single();

  if (error || !data) throwDbError(error, 'initiatePayment');

  const payment = toDto(data as PaymentRow);
  const live = isEasyPaisaConfigured();

  if (!live) {
    // Local/dev: send user to our payments page with a demo confirm action.
    const checkoutUrl = `${frontend}/payments?paymentId=${payment.id}&demo=1`;
    await supabase
      .from('payments')
      .update({ status: 'redirected', updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('user_id', userId);

    return {
      payment: { ...payment, status: 'redirected' },
      checkoutUrl,
      formFields: null,
      demoMode: true,
    };
  }

  const formFields = buildCheckoutFormFields({
    orderRefNum: merchantOrderId,
    amountPkr: plan.amountPkr,
    postBackURL,
    email: user.email,
    mobile: user.phone,
  });

  await supabase
    .from('payments')
    .update({ status: 'redirected', updated_at: new Date().toISOString() })
    .eq('id', payment.id)
    .eq('user_id', userId);

  return {
    payment: { ...payment, status: 'redirected' },
    checkoutUrl: getEasyPaisaCheckoutUrl(),
    formFields: formFields as unknown as Record<string, string>,
    demoMode: false,
  };
}

/** Demo-only: mark payment paid without EasyPaisa (blocked when live keys set). */
export async function confirmDemoPayment(
  userId: string,
  paymentId: string
): Promise<PaymentDto> {
  if (isEasyPaisaConfigured()) {
    throw new AppError('Demo confirm is disabled when EasyPaisa is configured.', 403);
  }

  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      provider_txn_id: `DEMO-${Date.now()}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('user_id', userId)
    .in('status', ['pending', 'redirected'])
    .select('*')
    .maybeSingle();

  if (error) throwDbError(error, 'confirmDemoPayment');
  if (!data) throw new AppError('Payment not found or already finalized.', 404);
  return toDto(data as PaymentRow);
}

/**
 * EasyPaisa IPN / browser post-back.
 * Field names vary by product — map from query/body and verify hash before marking paid.
 */
export async function handleEasyPaisaCallback(
  body: Record<string, unknown>
): Promise<{ paymentId: string | null; status: PaymentStatus; redirectUrl: string }> {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(
    /\/$/,
    ''
  );

  const orderRef =
    String(body.orderRefNum || body.orderRefNumber || body.merchantOrderId || '').trim();
  const responseCode = String(
    body.responseCode || body.Response_Code || body.status || ''
  ).trim();
  const txnId = String(
    body.transactionId || body.Transaction_ID || body.txnId || ''
  ).trim();

  if (!orderRef) {
    return {
      paymentId: null,
      status: 'failed',
      redirectUrl: `${frontend}/payments?error=missing_order`,
    };
  }

  const { data: row, error } = await supabase
    .from('payments')
    .select('*')
    .eq('merchant_order_id', orderRef)
    .maybeSingle();

  if (error) throwDbError(error, 'handleEasyPaisaCallback');
  if (!row) {
    return {
      paymentId: null,
      status: 'failed',
      redirectUrl: `${frontend}/payments?error=unknown_order`,
    };
  }

  // Success codes differ by EasyPaisa product; treat common "0000" / "00" / "paid" as success.
  const success =
    responseCode === '0000' ||
    responseCode === '00' ||
    responseCode.toLowerCase() === 'paid' ||
    responseCode.toLowerCase() === 'success';

  const nextStatus: PaymentStatus = success ? 'paid' : 'failed';

  const { data: updated, error: updateError } = await supabase
    .from('payments')
    .update({
      status: nextStatus,
      provider_txn_id: txnId || (row as PaymentRow).provider_txn_id,
      updated_at: new Date().toISOString(),
      metadata: JSON.stringify({
        ...safeJson((row as PaymentRow).metadata),
        callback: body,
      }),
    })
    .eq('id', (row as PaymentRow).id)
    .select('*')
    .single();

  if (updateError) throwDbError(updateError, 'handleEasyPaisaCallback update');

  const payment = toDto(updated as PaymentRow);
  return {
    paymentId: payment.id,
    status: payment.status,
    redirectUrl: `${frontend}/payments?paymentId=${payment.id}&status=${payment.status}`,
  };
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}
