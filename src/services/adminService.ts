import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  barAddress: string;
  emailVerified: boolean;
  isActive: boolean;
  isSuperadmin: boolean;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  createdAt: string;
  planId: string | null;
  subscriptionPeriodEnd: string | null;
}

export interface AdminPaymentListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  amountPkr: number;
  currency: string;
  status: string;
  provider: string;
  merchantOrderId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubscriptionListItem {
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  status: string;
  source: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  subscribedAt: string;
  userSubscriptionStatus: string;
  userSubscriptionExpiresAt: string | null;
}

export interface RevenueMonthRow {
  month: string;
  totalPkr: number;
  paymentCount: number;
}

function isTruthyFlag(raw: string | null | undefined): boolean {
  return String(raw ?? 'false') === 'true';
}

export async function listUsers(): Promise<AdminUserListItem[]> {
  const { data: users, error } = await supabase
    .from('users')
    .select(
      'id, name, email, phone, bar_address, email_verified, is_active, is_superadmin, subscription_status, subscription_expires_at, created_at'
    )
    .order('created_at', { ascending: false });

  if (error) throwDbError(error, 'adminListUsers');

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('user_id, plan_id, current_period_end');

  if (subsError) throwDbError(subsError, 'adminListUsers.subscriptions');

  const subByUser = new Map<
    string,
    { planId: string; currentPeriodEnd: string }
  >();
  for (const row of subs ?? []) {
    subByUser.set(String(row.user_id), {
      planId: String(row.plan_id),
      currentPeriodEnd: String(row.current_period_end),
    });
  }

  return (users ?? []).map((u) => {
    const sub = subByUser.get(String(u.id));
    return {
      id: String(u.id),
      name: String(u.name),
      email: String(u.email),
      phone: String(u.phone),
      barAddress: String(u.bar_address),
      emailVerified: String(u.email_verified) === 'true',
      isActive: String(u.is_active ?? 'true') !== 'false',
      isSuperadmin: isTruthyFlag(u.is_superadmin),
      subscriptionStatus: String(u.subscription_status ?? 'none'),
      subscriptionExpiresAt: u.subscription_expires_at
        ? String(u.subscription_expires_at)
        : null,
      createdAt: String(u.created_at),
      planId: sub?.planId ?? null,
      subscriptionPeriodEnd: sub?.currentPeriodEnd ?? null,
    };
  });
}

export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<AdminUserListItem> {
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (findError) throwDbError(findError, 'setUserActive');
  if (!existing) throw new AppError('User not found.', 404);

  const { error } = await supabase
    .from('users')
    .update({ is_active: isActive ? 'true' : 'false' })
    .eq('id', userId);

  if (error) throwDbError(error, 'setUserActive.update');

  const all = await listUsers();
  const updated = all.find((u) => u.id === userId);
  if (!updated) throw new AppError('User not found.', 404);
  return updated;
}

export async function listPayments(): Promise<AdminPaymentListItem[]> {
  const { data: payments, error } = await supabase
    .from('payments')
    .select(
      'id, user_id, plan_id, amount_pkr, currency, status, provider, merchant_order_id, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throwDbError(error, 'adminListPayments');

  const userIds = [...new Set((payments ?? []).map((p) => String(p.user_id)))];
  const usersById = new Map<string, { email: string; name: string }>();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .in('id', userIds);

    if (usersError) throwDbError(usersError, 'adminListPayments.users');
    for (const u of users ?? []) {
      usersById.set(String(u.id), {
        email: String(u.email),
        name: String(u.name),
      });
    }
  }

  return (payments ?? []).map((p) => {
    const user = usersById.get(String(p.user_id));
    return {
      id: String(p.id),
      userId: String(p.user_id),
      userEmail: user?.email ?? '',
      userName: user?.name ?? '',
      planId: String(p.plan_id),
      amountPkr: parseInt(String(p.amount_pkr), 10) || 0,
      currency: String(p.currency),
      status: String(p.status),
      provider: String(p.provider),
      merchantOrderId: String(p.merchant_order_id),
      createdAt: String(p.created_at),
      updatedAt: String(p.updated_at),
    };
  });
}

export async function listSubscriptions(): Promise<AdminSubscriptionListItem[]> {
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select(
      'user_id, plan_id, status, source, current_period_start, current_period_end, subscribed_at'
    )
    .order('current_period_end', { ascending: false });

  if (error) throwDbError(error, 'adminListSubscriptions');

  const userIds = [...new Set((rows ?? []).map((r) => String(r.user_id)))];
  const usersById = new Map<
    string,
    { email: string; name: string; subscriptionStatus: string; expires: string | null }
  >();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, subscription_status, subscription_expires_at')
      .in('id', userIds);

    if (usersError) throwDbError(usersError, 'adminListSubscriptions.users');
    for (const u of users ?? []) {
      usersById.set(String(u.id), {
        email: String(u.email),
        name: String(u.name),
        subscriptionStatus: String(u.subscription_status ?? 'none'),
        expires: u.subscription_expires_at
          ? String(u.subscription_expires_at)
          : null,
      });
    }
  }

  return (rows ?? []).map((r) => {
    const user = usersById.get(String(r.user_id));
    return {
      userId: String(r.user_id),
      userEmail: user?.email ?? '',
      userName: user?.name ?? '',
      planId: String(r.plan_id),
      status: String(r.status),
      source: String(r.source),
      currentPeriodStart: String(r.current_period_start),
      currentPeriodEnd: String(r.current_period_end),
      subscribedAt: String(r.subscribed_at),
      userSubscriptionStatus: user?.subscriptionStatus ?? 'none',
      userSubscriptionExpiresAt: user?.expires ?? null,
    };
  });
}

export async function revenueByMonth(
  monthsBack = 12
): Promise<RevenueMonthRow[]> {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - (monthsBack - 1));
  since.setUTCHours(0, 0, 0, 0);

  const { data: payments, error } = await supabase
    .from('payments')
    .select('amount_pkr, created_at, status')
    .eq('status', 'paid')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throwDbError(error, 'revenueByMonth');

  const buckets = new Map<string, { totalPkr: number; paymentCount: number }>();

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(since);
    d.setUTCMonth(since.getUTCMonth() + i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { totalPkr: 0, paymentCount: 0 });
  }

  for (const p of payments ?? []) {
    const created = new Date(String(p.created_at));
    const key = `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.totalPkr += parseInt(String(p.amount_pkr), 10) || 0;
    bucket.paymentCount += 1;
  }

  return [...buckets.entries()].map(([month, stats]) => ({
    month,
    totalPkr: stats.totalPkr,
    paymentCount: stats.paymentCount,
  }));
}
