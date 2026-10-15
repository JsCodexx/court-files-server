import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';
import { isDevPremiumEmail } from '../utils/env';
import { getPlanById } from './plansPricingService';
import {
  getSubscriptionProfile,
  type SubscriptionBillingStatus,
  type SubscriptionProfileRow,
  updateSubscriptionBillingStatus,
  upsertSubscriptionProfile,
} from './subscriptionsDb';

/** Free tier: create up to this many cases without a paid subscription. */
export const FREE_CASE_LIMIT = 10;

/** Days after subscription_expires_at when premium access ends (daily promo during grace). */
export const SUBSCRIPTION_GRACE_DAYS = 5;

/** Internal testers — not tied to live gateway settlement. */
export const DEV_PREMIUM_PERIOD_END = new Date('2030-12-31T23:59:59.000Z');

async function loadUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throwDbError(error, 'loadUserEmail');
  return data?.email != null ? String(data.email) : null;
}

export async function userHasDevPremium(userId: string): Promise<boolean> {
  const email = await loadUserEmail(userId);
  return isDevPremiumEmail(email);
}

function billingStatusFromLabel(
  label: SubscriptionStatusLabel
): SubscriptionBillingStatus | null {
  if (label === 'active' || label === 'grace' || label === 'lapsed') {
    return label;
  }
  return null;
}

async function syncUserSubscriptionCache(
  userId: string,
  periodEnd: Date,
  status: SubscriptionStatusLabel
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      subscription_expires_at: periodEnd.toISOString(),
      subscription_status: status,
    })
    .eq('id', userId);
  if (error) throwDbError(error, 'syncUserSubscriptionCache');
}

export interface SubscriptionProfileDto extends SubscriptionProfileRow {
  planName: string | null;
}

export async function getSubscriptionProfileForUser(
  userId: string
): Promise<SubscriptionProfileDto | null> {
  const profile = await getSubscriptionProfile(userId);
  if (!profile) return null;
  const plan = await getPlanById(profile.planId);
  return {
    ...profile,
    planName: plan?.name ?? (profile.planId === 'dev' ? 'Dev access' : null),
  };
}

export type SubscriptionPhase = 'none' | 'active' | 'grace' | 'lapsed';

/** Stored on users.subscription_status — updated by cron + payment webhook. */
export type SubscriptionStatusLabel =
  | 'none'
  | 'active'
  | 'grace'
  | 'lapsed'
  | 'free';

export interface SubscriptionStatusDto {
  freeCaseLimit: number;
  caseCount: number;
  freeCasesRemaining: number;
  phase: SubscriptionPhase;
  subscriptionStatus: SubscriptionStatusLabel;
  hasActiveSubscription: boolean;
  hasPremiumAccess: boolean;
  subscriptionExpiresAt: string | null;
  graceEndsAt: string | null;
  graceDaysRemaining: number;
  showDailyRenewalPromo: boolean;
  canAddCase: boolean;
  canAccessApp: boolean;
}

function parseExpiry(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function countUserCases(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throwDbError(error, 'countUserCases');
  return count ?? 0;
}

function isLiveGatewaySettlement(providerTxnId: string | null | undefined): boolean {
  const id = String(providerTxnId || '').trim();
  if (!id) return false;
  return !id.startsWith('DEMO-') && !id.startsWith('DEMO-RG-');
}

/** Latest subscription period end from live gateway settlements only (not demo confirm). */
async function periodEndFromPaidPayments(userId: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('plan_id, updated_at, status, metadata, provider_txn_id')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .order('updated_at', { ascending: false });

  if (error) throwDbError(error, 'periodEndFromPaidPayments');

  let best: Date | null = null;
  for (const row of data ?? []) {
    if (!isLiveGatewaySettlement(row.provider_txn_id as string | null)) {
      continue;
    }
    const meta = safeJson(String(row.metadata || '{}'));
    const fromMeta = parseExpiry(String(meta.subscriptionPeriodEnd || ''));
    if (fromMeta && (!best || fromMeta > best)) {
      best = fromMeta;
      continue;
    }
    const plan = await getPlanById(String(row.plan_id));
    if (!plan) continue;
    const paidAt = parseExpiry(String(row.updated_at));
    if (!paidAt) continue;
    const ends = new Date(
      paidAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
    );
    if (!best || ends > best) best = ends;
  }
  return best;
}

async function readUserSubscriptionFields(userId: string): Promise<{
  periodEnd: Date | null;
  storedStatus: string | null;
}> {
  const { data: user, error } = await supabase
    .from('users')
    .select('subscription_expires_at, subscription_status')
    .eq('id', userId)
    .maybeSingle();

  if (error) throwDbError(error, 'readUserSubscriptionFields');

  const fromColumn = parseExpiry(
    user?.subscription_expires_at as string | null | undefined
  );
  const fromPayments = await periodEndFromPaidPayments(userId);

  /** User column is maintained by payments + cron; payment metadata is fallback only. */
  const periodEnd = fromColumn ?? fromPayments;

  return {
    periodEnd,
    storedStatus: (user?.subscription_status as string | null | undefined) ?? null,
  };
}

export function computeSubscriptionPhase(
  periodEnd: Date | null,
  now: Date = new Date()
): {
  phase: SubscriptionPhase;
  graceEndsAt: Date | null;
  graceDaysRemaining: number;
} {
  if (!periodEnd) {
    return { phase: 'none', graceEndsAt: null, graceDaysRemaining: 0 };
  }

  const endMs = periodEnd.getTime();
  const nowMs = now.getTime();
  const graceMs = SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const graceEndsAt = new Date(endMs + graceMs);

  if (nowMs < endMs) {
    return { phase: 'active', graceEndsAt, graceDaysRemaining: SUBSCRIPTION_GRACE_DAYS };
  }
  if (nowMs < graceEndsAt.getTime()) {
    const remainingMs = graceEndsAt.getTime() - nowMs;
    const graceDaysRemaining = Math.max(
      1,
      Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
    );
    return { phase: 'grace', graceEndsAt, graceDaysRemaining };
  }
  return { phase: 'lapsed', graceEndsAt, graceDaysRemaining: 0 };
}

function statusLabelFor(
  phase: SubscriptionPhase,
  caseCount: number,
  hadPaidPeriod: boolean
): SubscriptionStatusLabel {
  if (phase === 'active') return 'active';
  if (phase === 'grace') return 'grace';
  if (phase === 'lapsed') {
    if (caseCount <= FREE_CASE_LIMIT && !hadPaidPeriod) return 'free';
    return 'lapsed';
  }
  if (caseCount <= FREE_CASE_LIMIT) return 'free';
  return 'none';
}

/** Latest active subscription end (future only) — for stacking renewals. */
export async function getActiveSubscriptionExpiresAt(
  userId: string
): Promise<Date | null> {
  const { periodEnd } = await readUserSubscriptionFields(userId);
  if (!periodEnd || periodEnd.getTime() <= Date.now()) return null;
  return periodEnd;
}

export async function syncUserSubscriptionStatus(
  userId: string,
  now: Date = new Date()
): Promise<SubscriptionStatusLabel> {
  if (await userHasDevPremium(userId)) {
    const periodEnd = DEV_PREMIUM_PERIOD_END;
    await syncUserSubscriptionCache(userId, periodEnd, 'active');
    const existing = await getSubscriptionProfile(userId);
    const periodStart = existing
      ? new Date(existing.currentPeriodStart)
      : now;
    await upsertSubscriptionProfile({
      userId,
      planId: 'dev',
      source: 'dev_grant',
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      firstPaymentId: null,
      lastPaymentId: null,
      subscribedAt: existing ? new Date(existing.subscribedAt) : now,
    });
    return 'active';
  }

  const caseCount = await countUserCases(userId);
  const { periodEnd } = await readUserSubscriptionFields(userId);
  const hadPaidPeriod = periodEnd !== null;
  const { phase } = computeSubscriptionPhase(periodEnd, now);
  const label = statusLabelFor(phase, caseCount, hadPaidPeriod);

  const { error } = await supabase
    .from('users')
    .update({ subscription_status: label })
    .eq('id', userId);

  if (error) throwDbError(error, 'syncUserSubscriptionStatus');

  const billingStatus = billingStatusFromLabel(label);
  if (billingStatus) {
    await updateSubscriptionBillingStatus(userId, billingStatus);
  }

  return label;
}

/** Extend subscription after a successful plan payment; updates user + payment metadata. */
export async function extendSubscriptionForPlan(
  userId: string,
  planId: string,
  paidAt: Date = new Date(),
  paymentId?: string
): Promise<{ periodStart: string; periodEnd: string }> {
  const plan = await getPlanById(planId);
  if (!plan) {
    return { periodStart: paidAt.toISOString(), periodEnd: paidAt.toISOString() };
  }

  const current = await getActiveSubscriptionExpiresAt(userId);
  const nowMs = paidAt.getTime();
  const periodStart = new Date(
    current && current.getTime() > nowMs ? current.getTime() : nowMs
  );
  const periodEnd = new Date(
    periodStart.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
  );

  await syncUserSubscriptionCache(userId, periodEnd, 'active');

  if (paymentId) {
    const { data: payment, error: loadErr } = await supabase
      .from('payments')
      .select('metadata')
      .eq('id', paymentId)
      .maybeSingle();
    if (loadErr) throwDbError(loadErr, 'extendSubscriptionForPlan payment');

    const meta = safeJson(String(payment?.metadata || '{}'));
    const nextMeta = {
      ...meta,
      subscriptionPeriodStart: periodStart.toISOString(),
      subscriptionPeriodEnd: periodEnd.toISOString(),
      subscriptionPlanId: planId,
      subscriptionPlanName: plan.name,
    };

    const { error: metaErr } = await supabase
      .from('payments')
      .update({
        metadata: JSON.stringify(nextMeta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);
    if (metaErr) throwDbError(metaErr, 'extendSubscriptionForPlan metadata');

    await upsertSubscriptionProfile({
      userId,
      planId,
      source: 'payment',
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      firstPaymentId: paymentId,
      lastPaymentId: paymentId,
      subscribedAt: paidAt,
    });
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

export async function getSubscriptionStatus(
  userId: string,
  now: Date = new Date()
): Promise<SubscriptionStatusDto> {
  const caseCount = await countUserCases(userId);

  if (await userHasDevPremium(userId)) {
    const periodEnd = DEV_PREMIUM_PERIOD_END;
    return {
      freeCaseLimit: FREE_CASE_LIMIT,
      caseCount,
      freeCasesRemaining: Math.max(0, FREE_CASE_LIMIT - caseCount),
      phase: 'active',
      subscriptionStatus: 'active',
      hasActiveSubscription: true,
      hasPremiumAccess: true,
      subscriptionExpiresAt: periodEnd.toISOString(),
      graceEndsAt: null,
      graceDaysRemaining: 0,
      showDailyRenewalPromo: false,
      canAddCase: true,
      canAccessApp: true,
    };
  }

  const { periodEnd } = await readUserSubscriptionFields(userId);
  const hadPaidPeriod = periodEnd !== null;
  const { phase, graceEndsAt, graceDaysRemaining } = computeSubscriptionPhase(
    periodEnd,
    now
  );

  const hasPremiumAccess = phase === 'active' || phase === 'grace';
  const hasActiveSubscription = phase === 'active';
  const freeCasesRemaining = Math.max(0, FREE_CASE_LIMIT - caseCount);
  const canAddCase = caseCount < FREE_CASE_LIMIT || hasPremiumAccess;
  const canAccessApp = hasPremiumAccess || caseCount <= FREE_CASE_LIMIT;

  const subscriptionStatus = statusLabelFor(phase, caseCount, hadPaidPeriod);

  return {
    freeCaseLimit: FREE_CASE_LIMIT,
    caseCount,
    freeCasesRemaining,
    phase,
    subscriptionStatus,
    hasActiveSubscription,
    hasPremiumAccess,
    subscriptionExpiresAt:
      periodEnd && hasActiveSubscription ? periodEnd.toISOString() : periodEnd?.toISOString() ?? null,
    graceEndsAt: graceEndsAt?.toISOString() ?? null,
    graceDaysRemaining: phase === 'grace' ? graceDaysRemaining : 0,
    showDailyRenewalPromo: phase === 'grace',
    canAddCase,
    canAccessApp,
  };
}

export async function assertCanCreateCase(userId: string): Promise<void> {
  const status = await getSubscriptionStatus(userId);
  if (status.canAddCase) return;

  throw new AppError(
    'Case limit reached. Purchase a plan to add more cases.',
    402
  );
}

export async function assertCanAccessApp(userId: string): Promise<void> {
  const status = await getSubscriptionStatus(userId);
  if (status.canAccessApp) return;

  throw new AppError(
    'Your subscription has expired. Renew your plan to continue using Court Files.',
    403
  );
}

/** Cron: refresh subscription_status for users with a billing history. */
export async function refreshAllSubscriptionStatuses(): Promise<{
  updated: number;
  grace: number;
  lapsed: number;
}> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .not('subscription_expires_at', 'is', null);

  if (error) throwDbError(error, 'refreshAllSubscriptionStatuses');

  let updated = 0;
  let grace = 0;
  let lapsed = 0;

  for (const row of data ?? []) {
    const label = await syncUserSubscriptionStatus(String(row.id));
    updated += 1;
    if (label === 'grace') grace += 1;
    if (label === 'lapsed') lapsed += 1;
  }

  return { updated, grace, lapsed };
}

/** Backfill subscription period fields on paid payments missing metadata. */
export async function reconcileSubscriptionFromPayments(): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, user_id, plan_id, updated_at, metadata, status')
    .eq('status', 'paid')
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throwDbError(error, 'reconcileSubscriptionFromPayments');

  let updated = 0;
  for (const row of data ?? []) {
    const meta = safeJson(String(row.metadata || '{}'));
    if (meta.subscriptionPeriodEnd) continue;

    const plan = await getPlanById(String(row.plan_id));
    if (!plan) continue;

    const paidAt = parseExpiry(String(row.updated_at)) || new Date();
    const periodStart = paidAt;
    const periodEnd = new Date(
      paidAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
    );

    const nextMeta = {
      ...meta,
      subscriptionPeriodStart: periodStart.toISOString(),
      subscriptionPeriodEnd: periodEnd.toISOString(),
      subscriptionPlanId: plan.id,
      subscriptionPlanName: plan.name,
    };

    const { error: metaErr } = await supabase
      .from('payments')
      .update({
        metadata: JSON.stringify(nextMeta),
        updated_at: String(row.updated_at),
      })
      .eq('id', String(row.id));
    if (metaErr) throwDbError(metaErr, 'reconcileSubscriptionFromPayments meta');
    updated += 1;
  }
  return updated;
}
