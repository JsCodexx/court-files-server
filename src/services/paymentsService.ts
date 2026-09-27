import crypto from 'crypto';
import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';
import {
  buildCheckoutFormFields,
  getEasyPaisaCheckoutUrl,
  isEasyPaisaConfigured,
} from '../utils/easypaisa';
import {
  isMailConfigured,
  sendPaymentWelcomeEmail,
  sendTemporaryPasswordEmail,
} from '../utils/mailer';
import { hashPassword } from '../utils/password';
import { getPlanById, PLANS, PlanDto } from './plansCatalog';

/** Readable one-time password for guest checkout emails. */
function generateTempPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

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
  user: { email?: string; phone?: string; guestCheckout?: boolean } = {}
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
      provider: 'rapidgateway',
      status: 'pending',
      merchant_order_id: merchantOrderId,
      metadata: JSON.stringify({
        planName: plan.name,
        gateway: 'RapidGateway',
        ...(user.guestCheckout ? { guestCheckout: true } : {}),
      }),
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

/**
 * Guest checkout — no prior account required.
 * Creates a lightweight user from checkout details if needed, then starts payment.
 */
export async function initiateGuestPayment(input: {
  planId: string;
  name: string;
  email: string;
  phone: string;
}): Promise<InitiateResult & { accountCreated: boolean }> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const name = input.name.trim();

  if (!name || !email || !phone) {
    throw new AppError('Name, email and phone are required for checkout.', 400);
  }
  if (!/^03\d{9}$/.test(phone) && !/^\+923\d{9}$/.test(phone)) {
    throw new AppError(
      'Phone must be a valid Pakistani mobile (03XXXXXXXXX or +923XXXXXXXXX).',
      400
    );
  }

  const normalizedPhone = phone.startsWith('+92')
    ? `0${phone.slice(3)}`
    : phone;

  const { data: byEmail } = await supabase
    .from('users')
    .select('id, email, phone')
    .eq('email', email)
    .maybeSingle();

  let userId: string;
  let accountCreated = false;

  if (byEmail) {
    userId = byEmail.id as string;
  } else {
    const { data: byPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle();
    if (byPhone) {
      throw new AppError(
        'This phone is already registered with another email. Sign in or use a different phone.',
        409
      );
    }

    // Placeholder hash until payment succeeds — then a temp password is emailed.
    const placeholderHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
    const { data: created, error: createError } = await supabase
      .from('users')
      .insert({
        name,
        email,
        phone: normalizedPhone,
        bar_address: 'Guest checkout',
        password_hash: placeholderHash,
        email_verified: 'true',
        token_version: '0',
        must_change_password: 'true',
      })
      .select('id')
      .single();

    if (createError || !created) throwDbError(createError, 'initiateGuestPayment create user');
    userId = created.id as string;
    accountCreated = true;
  }

  const result = await initiatePayment(userId, input.planId, {
    email,
    phone: normalizedPhone,
    guestCheckout: true,
  });

  // Guest-friendly demo URL (public checkout result page)
  if (result.demoMode) {
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(
      /\/$/,
      ''
    );
    result.checkoutUrl = `${frontend}/checkout?paymentId=${result.payment.id}&demo=1&email=${encodeURIComponent(email)}`;
  }

  return { ...result, accountCreated };
}

export async function getGuestPayment(
  paymentId: string,
  email: string
): Promise<PaymentDto> {
  const normalized = email.trim().toLowerCase();
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle();

  if (error) throwDbError(error, 'getGuestPayment');
  if (!payment) throw new AppError('Payment not found', 404);

  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', (payment as PaymentRow).user_id)
    .maybeSingle();

  if (!user || String(user.email).toLowerCase() !== normalized) {
    throw new AppError('Payment not found', 404);
  }

  return toDto(payment as PaymentRow);
}

export async function confirmGuestDemoPayment(
  paymentId: string,
  email: string
): Promise<PaymentDto> {
  if (isEasyPaisaConfigured()) {
    throw new AppError('Demo confirm is disabled when a live gateway is configured.', 403);
  }

  const payment = await getGuestPayment(paymentId, email);
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      provider_txn_id: `DEMO-RG-${Date.now()}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .in('status', ['pending', 'redirected'])
    .select('*')
    .maybeSingle();

  if (error) throwDbError(error, 'confirmGuestDemoPayment');
  if (!data) throw new AppError('Payment not found or already finalized.', 404);
  const dto = toDto(data as PaymentRow);
  await notifyAfterPaymentPaid(data as PaymentRow);
  return dto;
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
  const dto = toDto(data as PaymentRow);
  await notifyAfterPaymentPaid(data as PaymentRow);
  return dto;
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
  if (payment.status === 'paid') {
    await notifyAfterPaymentPaid(updated as PaymentRow);
  }

  const meta = safeJson((updated as PaymentRow).metadata);
  const guest = meta.guestCheckout === true;
  let redirectEmail = '';
  if (guest) {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', (updated as PaymentRow).user_id)
      .maybeSingle();
    if (user?.email) {
      redirectEmail = `&email=${encodeURIComponent(String(user.email))}`;
    }
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    redirectUrl: guest
      ? `${frontend}/checkout?paymentId=${payment.id}&status=${payment.status}${redirectEmail}`
      : `${frontend}/payments?paymentId=${payment.id}&status=${payment.status}`,
  };
}

/**
 * After a successful payment: welcome email + (for guest accounts) temporary password email.
 */
async function notifyAfterPaymentPaid(payment: PaymentRow): Promise<void> {
  if (!isMailConfigured()) {
    console.warn('SMTP not configured — skipping post-payment emails');
    return;
  }

  const meta = safeJson(payment.metadata);
  if (meta.checkoutEmailsSent === true) return;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, must_change_password')
    .eq('id', payment.user_id)
    .maybeSingle();

  if (error) {
    console.error('notifyAfterPaymentPaid load user:', error);
    return;
  }
  if (!user?.email) return;

  const plan = getPlanById(payment.plan_id);
  const planName = plan?.name || payment.plan_id;

  try {
    await sendPaymentWelcomeEmail({
      to: String(user.email),
      name: String(user.name || 'Advocate'),
      planName,
      amountPkr: payment.amount_pkr,
      orderId: payment.merchant_order_id,
    });

    if (String(user.must_change_password || 'false') === 'true') {
      const temporaryPassword = generateTempPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const { error: pwError } = await supabase
        .from('users')
        .update({ password_hash: passwordHash })
        .eq('id', user.id);
      if (pwError) throwDbError(pwError, 'notifyAfterPaymentPaid temp password');

      await sendTemporaryPasswordEmail({
        to: String(user.email),
        name: String(user.name || 'Advocate'),
        temporaryPassword,
      });
    }

    await supabase
      .from('payments')
      .update({
        metadata: JSON.stringify({ ...meta, checkoutEmailsSent: true }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);
  } catch (err) {
    console.error('notifyAfterPaymentPaid failed:', err);
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}
