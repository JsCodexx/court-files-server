import crypto from 'crypto';
import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';
import {
  isMailConfigured,
  sendPaymentWelcomeEmail,
  sendTemporaryPasswordEmail,
} from '../utils/mailer';
import { hashPassword } from '../utils/password';
import {
  createRapidPayment,
  isRapidGatewayConfigured,
  verifyRapidWebhookSignature,
} from '../utils/rapidgateway';
import { isDemoPaymentsEnabled } from '../utils/env';
import { extendSubscriptionForPlan } from './subscriptionService';
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
  /** Absolute URL to open (RapidGateway hosted page or local demo checkout). */
  checkoutUrl: string;
  demoMode: boolean;
}

export async function initiatePayment(
  userId: string,
  planId: string,
  user: {
    email?: string;
    phone?: string;
    name?: string;
    guestCheckout?: boolean;
  } = {}
): Promise<InitiateResult> {
  const plan = getPlanById(planId);
  if (!plan) throw new AppError('Unknown plan.', 400);

  const merchantOrderId = newOrderId();
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(
    /\/$/,
    ''
  );

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

  // Prefer Rapid Gateway when configured.
  if (isRapidGatewayConfigured()) {
    const email = String(user.email || '').trim();
    const phone = String(user.phone || '').trim();
    if (!email || !phone) {
      throw new AppError(
        'Email and mobile number are required for RapidGateway checkout.',
        400
      );
    }

    const guestQs = user.guestCheckout
      ? `&email=${encodeURIComponent(email)}`
      : '';
    const orderQs = `paymentId=${payment.id}&order=${encodeURIComponent(merchantOrderId)}`;
    const successUrl = user.guestCheckout
      ? `${frontend}/checkout?${orderQs}${guestQs}`
      : `${frontend}/payments?${orderQs}`;
    const failureUrl = user.guestCheckout
      ? `${frontend}/checkout?${orderQs}&failed=1${guestQs}`
      : `${frontend}/payments?${orderQs}&failed=1`;

    try {
      const rg = await createRapidPayment({
        amountPkr: plan.amountPkr,
        merchantTransactionId: merchantOrderId,
        customer: {
          email,
          phone,
          name: user.name,
        },
        successUrl,
        failureUrl,
        checkoutUrl: `${frontend}/checkout`,
        description: plan.name,
      });

      await supabase
        .from('payments')
        .update({
          status: 'redirected',
          provider_txn_id: rg.id,
          metadata: JSON.stringify({
            ...safeJson((data as PaymentRow).metadata),
            rapidPaymentId: rg.id,
            rapidCheckoutUrl: rg.checkoutUrl,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id)
        .eq('user_id', userId);

      return {
        payment: { ...payment, status: 'redirected', providerTxnId: rg.id },
        checkoutUrl: rg.checkoutUrl,
        demoMode: false,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'RapidGateway checkout failed';
      console.error('RapidGateway create payment failed:', err);
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          metadata: JSON.stringify({
            ...safeJson((data as PaymentRow).metadata),
            rapidError: message,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      throw new AppError(
        'Unable to start RapidGateway checkout. Please try again.',
        502
      );
    }
  }

  if (!isDemoPaymentsEnabled()) {
    throw new AppError(
      'Online payments are not configured. Please try again later.',
      503
    );
  }

  // Local/dev demo when RapidGateway keys are not set.
  const checkoutUrl = user.guestCheckout
    ? `${frontend}/checkout?paymentId=${payment.id}&demo=1&email=${encodeURIComponent(
        String(user.email || '')
      )}`
    : `${frontend}/payments?paymentId=${payment.id}&demo=1`;
  await supabase
    .from('payments')
    .update({ status: 'redirected', updated_at: new Date().toISOString() })
    .eq('id', payment.id)
    .eq('user_id', userId);

  return {
    payment: { ...payment, status: 'redirected' },
    checkoutUrl,
    demoMode: true,
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
    throw new AppError(
      'An account already exists with this email. Sign in to purchase a plan.',
      409
    );
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
        email_verified: 'false',
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
    name,
    guestCheckout: true,
  });

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
  if (!isDemoPaymentsEnabled()) {
    throw new AppError('Demo payments are disabled.', 403);
  }
  if (isRapidGatewayConfigured()) {
    throw new AppError('Demo confirm is disabled when RapidGateway is configured.', 403);
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
  await extendSubscriptionForPlan(
    (data as PaymentRow).user_id,
    (data as PaymentRow).plan_id,
    new Date(),
    (data as PaymentRow).id
  );
  await notifyAfterPaymentPaid(data as PaymentRow);
  return dto;
}

/** Demo-only: mark payment paid without RapidGateway (blocked when live keys set). */
export async function confirmDemoPayment(
  userId: string,
  paymentId: string
): Promise<PaymentDto> {
  if (!isDemoPaymentsEnabled()) {
    throw new AppError('Demo payments are disabled.', 403);
  }
  if (isRapidGatewayConfigured()) {
    throw new AppError('Demo confirm is disabled when RapidGateway is configured.', 403);
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
  await extendSubscriptionForPlan(
    (data as PaymentRow).user_id,
    (data as PaymentRow).plan_id,
    new Date(),
    (data as PaymentRow).id
  );
  await notifyAfterPaymentPaid(data as PaymentRow);
  return dto;
}

/**
 * Rapid Gateway signed webhook — mark order paid/failed from merchantTransactionId.
 */
export async function handleRapidGatewayWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  body: Record<string, unknown>;
}): Promise<{ httpStatus: number; message: string }> {
  const header = (name: string): string => {
    const v = input.headers[name] ?? input.headers[name.toLowerCase()];
    return Array.isArray(v) ? String(v[0] || '') : String(v || '');
  };

  const timestamp =
    header('x-rapidgateway-timestamp') || header('x-rg-timestamp');
  const signature =
    header('x-rapidgateway-signature') || header('x-rg-signature');

  if (
    !verifyRapidWebhookSignature({
      timestamp,
      rawBody: input.rawBody,
      signature,
    })
  ) {
    return { httpStatus: 401, message: 'Invalid webhook signature' };
  }

  const body = input.body || {};
  const eventType = String(
    body.eventType || body.event_type || body.type || ''
  ).trim();
  const statusRaw = String(body.status || '').trim().toUpperCase();
  const orderRef = String(
    body.merchantTransactionId ||
      body.merchant_transaction_id ||
      body.basketId ||
      body.BASKET_ID ||
      body.orderRefNum ||
      ''
  ).trim();
  const gatewayTxn = String(
    body.gatewayTxnRef || body.gateway_txn_ref || body.id || ''
  ).trim();
  const eventId = String(body.eventId || body.event_id || '').trim();

  if (eventType === 'webhook.test') {
    return { httpStatus: 200, message: 'Test webhook accepted' };
  }

  if (!orderRef) {
    return { httpStatus: 400, message: 'Missing merchantTransactionId' };
  }

  const { data: row, error } = await supabase
    .from('payments')
    .select('*')
    .eq('merchant_order_id', orderRef)
    .maybeSingle();

  if (error) throwDbError(error, 'handleRapidGatewayWebhook');
  if (!row) {
    return { httpStatus: 404, message: 'Unknown order' };
  }

  const payment = row as PaymentRow;
  if (payment.status === 'paid') {
    return { httpStatus: 200, message: 'Already paid' };
  }

  const success =
    eventType === 'transaction.completed' ||
    eventType === 'payment.succeeded' ||
    statusRaw === 'SUCCESS' ||
    statusRaw === 'PAID' ||
    statusRaw === 'COMPLETED';

  const failed =
    eventType === 'transaction.failed' ||
    eventType === 'payment.failed' ||
    statusRaw === 'FAILED' ||
    statusRaw === 'DECLINED';

  if (!success && !failed) {
    return { httpStatus: 200, message: `Ignored event ${eventType || statusRaw}` };
  }

  const nextStatus: PaymentStatus = success ? 'paid' : 'failed';
  const meta = {
    ...safeJson(payment.metadata),
    rapidWebhookEventId: eventId || undefined,
    rapidWebhook: body,
  };

  const { data: updated, error: updateError } = await supabase
    .from('payments')
    .update({
      status: nextStatus,
      provider_txn_id: gatewayTxn || payment.provider_txn_id,
      metadata: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .in('status', ['pending', 'redirected'])
    .select('*')
    .maybeSingle();

  if (updateError) throwDbError(updateError, 'handleRapidGatewayWebhook update');

  if (updated && nextStatus === 'paid') {
    await extendSubscriptionForPlan(
      (updated as PaymentRow).user_id,
      (updated as PaymentRow).plan_id,
      new Date(),
      (updated as PaymentRow).id
    );
    await notifyAfterPaymentPaid(updated as PaymentRow);
  }

  return {
    httpStatus: 200,
    message: nextStatus === 'paid' ? 'Marked paid' : 'Marked failed',
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

    const guestAccount =
      String(user.must_change_password || 'false') === 'true';

    if (guestAccount) {
      const temporaryPassword = generateTempPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const { error: pwError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          email_verified: 'true',
        })
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
