import { PLANS, PlanDto } from './plansCatalog';
import { getSetting } from './appSettingsService';

const MONTHLY_KEY = 'plan_monthly_amount_pkr';
const YEARLY_KEY = 'plan_yearly_amount_pkr';

function parseAmount(raw: string, fallback: number): number {
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function listPlans(): Promise<PlanDto[]> {
  const [monthlyRaw, yearlyRaw] = await Promise.all([
    getSetting(MONTHLY_KEY, '150'),
    getSetting(YEARLY_KEY, '1400'),
  ]);

  const monthlyAmount = parseAmount(monthlyRaw, 150);
  const yearlyAmount = parseAmount(yearlyRaw, 1400);

  return PLANS.map((plan) => {
    if (plan.id === 'monthly') {
      return { ...plan, amountPkr: monthlyAmount };
    }
    if (plan.id === 'yearly') {
      return { ...plan, amountPkr: yearlyAmount };
    }
    return plan;
  });
}

export async function getPlanById(planId: string): Promise<PlanDto | undefined> {
  const plans = await listPlans();
  return plans.find((p) => p.id === planId);
}

export async function getPlanPriceSettings(): Promise<{
  monthlyAmountPkr: number;
  yearlyAmountPkr: number;
}> {
  const plans = await listPlans();
  const monthly = plans.find((p) => p.id === 'monthly')?.amountPkr ?? 150;
  const yearly = plans.find((p) => p.id === 'yearly')?.amountPkr ?? 1400;
  return { monthlyAmountPkr: monthly, yearlyAmountPkr: yearly };
}

export async function updatePlanPriceSettings(input: {
  monthlyAmountPkr: number;
  yearlyAmountPkr: number;
}): Promise<{ monthlyAmountPkr: number; yearlyAmountPkr: number }> {
  const { setSetting } = await import('./appSettingsService');
  await setSetting(MONTHLY_KEY, String(Math.round(input.monthlyAmountPkr)));
  await setSetting(YEARLY_KEY, String(Math.round(input.yearlyAmountPkr)));
  return getPlanPriceSettings();
}
