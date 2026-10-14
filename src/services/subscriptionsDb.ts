import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';

export type SubscriptionSource = 'payment' | 'dev_grant';

export type SubscriptionBillingStatus =
  | 'active'
  | 'grace'
  | 'lapsed'
  | 'canceled';

export interface SubscriptionProfileRow {
  userId: string;
  planId: string;
  source: SubscriptionSource;
  status: SubscriptionBillingStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  firstPaymentId: string | null;
  lastPaymentId: string | null;
  subscribedAt: string;
  createdAt: string;
  updatedAt: string;
}

function rowToProfile(row: Record<string, unknown>): SubscriptionProfileRow {
  return {
    userId: String(row.user_id),
    planId: String(row.plan_id),
    source: row.source as SubscriptionSource,
    status: row.status as SubscriptionBillingStatus,
    currentPeriodStart: String(row.current_period_start),
    currentPeriodEnd: String(row.current_period_end),
    firstPaymentId:
      row.first_payment_id != null ? String(row.first_payment_id) : null,
    lastPaymentId:
      row.last_payment_id != null ? String(row.last_payment_id) : null,
    subscribedAt: String(row.subscribed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Upsert full subscription details (payments table remains the gateway ledger). */
export async function upsertSubscriptionProfile(input: {
  userId: string;
  planId: string;
  source: SubscriptionSource;
  status: SubscriptionBillingStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  firstPaymentId?: string | null;
  lastPaymentId?: string | null;
  subscribedAt?: Date;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error: loadErr } = await supabase
    .from('subscriptions')
    .select('first_payment_id, subscribed_at')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (loadErr) throwDbError(loadErr, 'upsertSubscriptionProfile load');

  const firstPaymentId =
    existing?.first_payment_id != null
      ? String(existing.first_payment_id)
      : input.firstPaymentId ?? null;
  const subscribedAt =
    existing?.subscribed_at != null
      ? String(existing.subscribed_at)
      : (input.subscribedAt ?? input.currentPeriodStart).toISOString();

  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: input.userId,
      plan_id: input.planId,
      source: input.source,
      status: input.status,
      current_period_start: input.currentPeriodStart.toISOString(),
      current_period_end: input.currentPeriodEnd.toISOString(),
      first_payment_id: firstPaymentId,
      last_payment_id: input.lastPaymentId ?? firstPaymentId,
      subscribed_at: subscribedAt,
      updated_at: now,
      ...(existing ? {} : { created_at: now }),
    },
    { onConflict: 'user_id' }
  );
  if (error) throwDbError(error, 'upsertSubscriptionProfile');
}

export async function updateSubscriptionBillingStatus(
  userId: string,
  status: SubscriptionBillingStatus
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error) throwDbError(error, 'updateSubscriptionBillingStatus');
}

export async function getSubscriptionProfile(
  userId: string
): Promise<SubscriptionProfileRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwDbError(error, 'getSubscriptionProfile');
  if (!data) return null;
  return rowToProfile(data as Record<string, unknown>);
}
