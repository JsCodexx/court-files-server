import cron from 'node-cron';
import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';
import {
  FREE_CASE_LIMIT,
  getSubscriptionStatus,
  reconcileSubscriptionFromPayments,
  refreshAllSubscriptionStatuses,
} from '../services/subscriptionService';
import {
  isMailConfigured,
  sendSubscriptionExpiredEmail,
  sendSubscriptionGraceReminderEmail,
} from '../utils/mailer';

let started = false;

/**
 * Daily maintenance: payment metadata, subscription_status on users, grace/lapsed emails.
 */
export async function runSubscriptionMaintenance(): Promise<void> {
  const reconciled = await reconcileSubscriptionFromPayments();
  console.log(`[subscription-cron] reconciled ${reconciled} payment record(s)`);

  const { updated, grace, lapsed } = await refreshAllSubscriptionStatuses();
  console.log(
    `[subscription-cron] status refresh: ${updated} user(s), grace=${grace}, lapsed=${lapsed}`
  );

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name, subscription_status, subscription_expires_at')
    .in('subscription_status', ['grace', 'lapsed']);

  if (error) throwDbError(error, 'subscriptionCron users by status');

  let graceEmails = 0;
  let lapsedEmails = 0;

  for (const row of users ?? []) {
    const status = await getSubscriptionStatus(String(row.id));
    if (!row.email || !isMailConfigured()) continue;

    try {
      if (status.phase === 'grace') {
        await sendSubscriptionGraceReminderEmail({
          to: String(row.email),
          name: String(row.name || 'Advocate'),
          graceDaysRemaining: status.graceDaysRemaining,
          graceEndsAt: status.graceEndsAt || '',
        });
        graceEmails += 1;
      } else if (status.phase === 'lapsed' && !status.canAccessApp) {
        await sendSubscriptionExpiredEmail({
          to: String(row.email),
          name: String(row.name || 'Advocate'),
          caseCount: status.caseCount,
          freeLimit: FREE_CASE_LIMIT,
        });
        lapsedEmails += 1;
      }
    } catch (err) {
      console.error('[subscription-cron] email failed for', row.id, err);
    }
  }

  console.log(
    `[subscription-cron] emails: grace reminders=${graceEmails}, lapsed lock=${lapsedEmails}`
  );
}

export function startSubscriptionCron(): void {
  if (started) return;
  started = true;

  const schedule = process.env.SUBSCRIPTION_CRON_SCHEDULE?.trim() || '0 2 * * *';
  cron.schedule(schedule, () => {
    runSubscriptionMaintenance().catch((err) => {
      console.error('[subscription-cron] job failed:', err);
    });
  });

  console.log(`[subscription-cron] scheduled (${schedule})`);
}
