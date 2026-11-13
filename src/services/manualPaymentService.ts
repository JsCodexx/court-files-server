import crypto from 'crypto';
import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';
import { getSetting, setSetting } from './appSettingsService';
import { getPlanById, listPlans } from './plansPricingService';
import { isRapidGatewayCheckoutEnabled } from './checkoutAvailability';
import { extendSubscriptionForPlan, getSubscriptionStatus } from './subscriptionService';
import { isValidPakPhone } from '../utils/pakPhone';

export type ManualPaidToMethod = 'bank' | 'easypaisa' | 'jazzcash';

export type ManualRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ManualPaymentAccount {
  title: string;
  accountName: string;
  /** Bank IBAN or wallet number */
  accountNumber: string;
  bankName?: string;
}

export interface ManualPaymentInstructionsDto {
  enabled: boolean;
  bank: ManualPaymentAccount;
  easypaisa: ManualPaymentAccount;
  jazzcash: ManualPaymentAccount;
  notice: string;
  /** Pakistani mobile for payment screenshot WhatsApp (display form). */
  whatsappNumber: string;
  /** https://wa.me/923… deep link */
  whatsappUrl: string;
  plans: Awaited<ReturnType<typeof listPlans>>;
}

const ACCOUNTS_SETTING_KEY = 'manual_payment_accounts';
const ENABLED_SETTING_KEY = 'manual_payment_enabled';

const DEFAULT_ACCOUNTS = {
  bank: {
    title: 'Bank of Punjab',
    accountName: 'Waheed Ali',
    accountNumber: '6040259783300018',
    bankName: 'Bank of Punjab',
  },
  easypaisa: {
    title: 'Easypaisa',
    accountName: 'Waheed Ali',
    accountNumber: '03027857887',
  },
  jazzcash: {
    title: 'JazzCash',
    accountName: 'Waheed Ali',
    accountNumber: '03027857887',
  },
  notice:
    'Transfer the exact plan amount (PKR). Keep your transaction / TID number — you will need it in the form below.',
  whatsappNumber: '03027857887',
};

function buildWhatsAppUrl(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  } else if (!digits.startsWith('92') && digits.length === 10) {
    digits = `92${digits}`;
  }
  return digits ? `https://wa.me/${digits}` : '';
}

function parseAccountsJson(raw: string): typeof DEFAULT_ACCOUNTS {
  try {
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_ACCOUNTS> & {
      whatsappNumber?: string;
    };
    return {
      bank: { ...DEFAULT_ACCOUNTS.bank, ...parsed.bank },
      easypaisa: { ...DEFAULT_ACCOUNTS.easypaisa, ...parsed.easypaisa },
      jazzcash: { ...DEFAULT_ACCOUNTS.jazzcash, ...parsed.jazzcash },
      notice: parsed.notice ?? DEFAULT_ACCOUNTS.notice,
      whatsappNumber:
        String(parsed.whatsappNumber ?? DEFAULT_ACCOUNTS.whatsappNumber).trim() ||
        DEFAULT_ACCOUNTS.whatsappNumber,
    };
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

export async function getManualPaymentInstructions(): Promise<ManualPaymentInstructionsDto> {
  const [enabledRaw, accountsRaw, plans] = await Promise.all([
    getSetting(ENABLED_SETTING_KEY, 'true'),
    getSetting(ACCOUNTS_SETTING_KEY, JSON.stringify(DEFAULT_ACCOUNTS)),
    listPlans(),
  ]);
  const accounts = parseAccountsJson(accountsRaw);
  const whatsappNumber = accounts.whatsappNumber;
  return {
    enabled: enabledRaw === 'true',
    bank: accounts.bank,
    easypaisa: accounts.easypaisa,
    jazzcash: accounts.jazzcash,
    notice: accounts.notice,
    whatsappNumber,
    whatsappUrl: buildWhatsAppUrl(whatsappNumber),
    plans,
  };
}

/** Superadmin can update payout details without redeploying. */
export async function updateManualPaymentAccounts(input: {
  bank: ManualPaymentAccount;
  easypaisa: ManualPaymentAccount;
  jazzcash: ManualPaymentAccount;
  notice: string;
  whatsappNumber?: string;
  enabled?: boolean;
}): Promise<ManualPaymentInstructionsDto> {
  const existing = parseAccountsJson(
    await getSetting(ACCOUNTS_SETTING_KEY, JSON.stringify(DEFAULT_ACCOUNTS))
  );
  await setSetting(
    ACCOUNTS_SETTING_KEY,
    JSON.stringify({
      bank: input.bank,
      easypaisa: input.easypaisa,
      jazzcash: input.jazzcash,
      notice: input.notice,
      whatsappNumber:
        input.whatsappNumber?.trim() || existing.whatsappNumber,
    })
  );
  if (input.enabled !== undefined) {
    await setSetting(ENABLED_SETTING_KEY, input.enabled ? 'true' : 'false');
  }
  return getManualPaymentInstructions();
}

async function assertCanSubmitManualPayment(userId: string): Promise<void> {
  const status = await getSubscriptionStatus(userId);
  if (status.hasActiveSubscription) {
    throw new AppError(
      'You already have an active subscription. Renew after your current period ends.',
      409
    );
  }

  const { data: pendingGateway, error: gwErr } = await supabase
    .from('payments')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'redirected'])
    .limit(1);
  if (gwErr) throwDbError(gwErr, 'assertCanSubmitManualPayment gateway');
  if (pendingGateway?.length && (await isRapidGatewayCheckoutEnabled())) {
    throw new AppError(
      'A RapidGateway checkout is already in progress. Complete or cancel it first.',
      409
    );
  }

  const { data: pendingManual, error: manErr } = await supabase
    .from('manual_payment_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1);
  if (manErr) throwDbError(manErr, 'assertCanSubmitManualPayment manual');
  if (pendingManual?.length) {
    throw new AppError(
      'You already have a manual payment request under review. Wait for admin approval.',
      409
    );
  }
}

export interface ManualPaymentRequestDto {
  id: string;
  planId: string;
  amountPkr: number;
  status: ManualRequestStatus;
  paidToMethod: ManualPaidToMethod;
  transactionId: string;
  senderAccountName: string;
  senderAccountTitle: string;
  senderPhone: string;
  notes: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

interface ManualRow {
  id: string;
  user_id: string;
  plan_id: string;
  amount_pkr: string;
  status: string;
  paid_to_method: string;
  transaction_id: string;
  sender_account_name: string;
  sender_account_title: string;
  sender_phone: string;
  notes: string;
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toDto(row: ManualRow): ManualPaymentRequestDto {
  return {
    id: row.id,
    planId: row.plan_id,
    amountPkr: Number(row.amount_pkr),
    status: row.status as ManualRequestStatus,
    paidToMethod: row.paid_to_method as ManualPaidToMethod,
    transactionId: row.transaction_id,
    senderAccountName: row.sender_account_name,
    senderAccountTitle: row.sender_account_title,
    senderPhone: row.sender_phone,
    notes: row.notes,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export interface SubmitManualPaymentInput {
  planId: string;
  paidToMethod: ManualPaidToMethod;
  transactionId: string;
  senderAccountName: string;
  senderAccountTitle: string;
  senderPhone?: string;
  notes?: string;
}

export async function submitManualPaymentRequest(
  userId: string,
  input: SubmitManualPaymentInput
): Promise<ManualPaymentRequestDto> {
  const instructions = await getManualPaymentInstructions();
  if (!instructions.enabled) {
    throw new AppError('Manual payment requests are not available.', 403);
  }

  const plan = await getPlanById(input.planId);
  if (!plan) throw new AppError('Unknown plan.', 400);

  await assertCanSubmitManualPayment(userId);

  const txn = input.transactionId.trim();
  if (!txn || txn.length < 3 || txn.length > 80) {
    throw new AppError('Transaction / payment ID is required.', 400);
  }

  const senderName = input.senderAccountName.trim();
  if (!senderName || senderName.length < 2 || senderName.length > 120) {
    throw new AppError('Sender name is required.', 400);
  }

  if (input.senderAccountTitle.trim().length > 120) {
    throw new AppError('Sender account title is too long.', 400);
  }

  const phone = (input.senderPhone ?? '').trim();
  if (phone && !isValidPakPhone(phone)) {
    throw new AppError(
      'Phone must be a valid Pakistani mobile (03XXXXXXXXX or +923XXXXXXXXX).',
      400
    );
  }

  const noteText = (input.notes ?? '').trim();
  if (noteText.length > 500) {
    throw new AppError('Notes are too long.', 400);
  }

  const { data, error } = await supabase
    .from('manual_payment_requests')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      amount_pkr: String(plan.amountPkr),
      status: 'pending',
      paid_to_method: input.paidToMethod,
      transaction_id: txn,
      sender_account_name: senderName,
      sender_account_title: input.senderAccountTitle.trim(),
      sender_phone: phone,
      notes: noteText,
    })
    .select('*')
    .single();

  if (error || !data) throwDbError(error, 'submitManualPaymentRequest');
  return toDto(data as ManualRow);
}

export async function listManualPaymentRequestsForUser(
  userId: string
): Promise<ManualPaymentRequestDto[]> {
  const { data, error } = await supabase
    .from('manual_payment_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throwDbError(error, 'listManualPaymentRequestsForUser');
  return ((data as ManualRow[]) ?? []).map(toDto);
}

export interface AdminManualPaymentRequestDto extends ManualPaymentRequestDto {
  userId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
}

export async function listManualPaymentRequestsAdmin(): Promise<
  AdminManualPaymentRequestDto[]
> {
  const { data, error } = await supabase
    .from('manual_payment_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throwDbError(error, 'listManualPaymentRequestsAdmin');

  const rows = (data as ManualRow[]) ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, name, email, phone')
    .in('id', userIds);

  if (userErr) throwDbError(userErr, 'listManualPaymentRequestsAdmin users');

  const byId = new Map(
    (users ?? []).map((u) => [
      String(u.id),
      {
        name: String(u.name),
        email: String(u.email),
        phone: String(u.phone),
      },
    ])
  );

  return rows.map((row) => {
    const u = byId.get(row.user_id);
    return {
      ...toDto(row),
      userId: row.user_id,
      userEmail: u?.email ?? '',
      userName: u?.name ?? '',
      userPhone: u?.phone ?? '',
    };
  });
}

function newManualOrderId(): string {
  return `CF-MANUAL-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function approveManualPaymentRequest(
  requestId: string,
  adminUserId: string,
  adminNote = ''
): Promise<AdminManualPaymentRequestDto> {
  const { data: row, error } = await supabase
    .from('manual_payment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) throwDbError(error, 'approveManualPaymentRequest load');
  if (!row) throw new AppError('Request not found.', 404);

  const req = row as ManualRow;
  if (req.status !== 'pending') {
    throw new AppError('This request was already reviewed.', 409);
  }

  const status = await getSubscriptionStatus(req.user_id);
  if (status.hasActiveSubscription) {
    throw new AppError(
      'User already has an active subscription. Reject this request or adjust their account first.',
      409
    );
  }

  const merchantOrderId = newManualOrderId();
  const paidAt = new Date();
  const meta = {
    manualPaymentRequestId: req.id,
    transactionId: req.transaction_id,
    paidToMethod: req.paid_to_method,
    senderAccountName: req.sender_account_name,
    senderAccountTitle: req.sender_account_title,
    approvedBy: adminUserId,
  };

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      user_id: req.user_id,
      plan_id: req.plan_id,
      amount_pkr: req.amount_pkr,
      currency: 'PKR',
      provider: 'manual',
      status: 'paid',
      merchant_order_id: merchantOrderId,
      provider_txn_id: req.transaction_id,
      metadata: JSON.stringify(meta),
      updated_at: paidAt.toISOString(),
    })
    .select('id')
    .single();

  if (payErr || !payment) throwDbError(payErr, 'approveManualPaymentRequest payment');

  await extendSubscriptionForPlan(
    req.user_id,
    req.plan_id,
    paidAt,
    String(payment.id)
  );

  const { data: updated, error: updErr } = await supabase
    .from('manual_payment_requests')
    .update({
      status: 'approved',
      admin_note: adminNote.trim(),
      reviewed_by: adminUserId,
      reviewed_at: paidAt.toISOString(),
      payment_id: payment.id,
      updated_at: paidAt.toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (updErr) throwDbError(updErr, 'approveManualPaymentRequest update');
  if (!updated) throw new AppError('Request could not be approved.', 409);

  const list = await listManualPaymentRequestsAdmin();
  const found = list.find((r) => r.id === requestId);
  if (!found) throw new AppError('Request not found after approval.', 500);
  return found;
}

export async function rejectManualPaymentRequest(
  requestId: string,
  adminUserId: string,
  adminNote = ''
): Promise<AdminManualPaymentRequestDto> {
  const { data: updated, error } = await supabase
    .from('manual_payment_requests')
    .update({
      status: 'rejected',
      admin_note: adminNote.trim(),
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throwDbError(error, 'rejectManualPaymentRequest');
  if (!updated) throw new AppError('Request not found or already reviewed.', 404);

  const list = await listManualPaymentRequestsAdmin();
  const found = list.find((r) => r.id === requestId);
  if (!found) throw new AppError('Request not found after rejection.', 500);
  return found;
}
