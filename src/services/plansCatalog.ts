export interface PlanDto {
  id: string;
  name: string;
  description: string;
  amountPkr: number;
  currency: 'PKR';
  durationDays: number;
  features: string[];
}

/** Hard-coded catalog for now — change amounts here before going live. */
export const PLANS: PlanDto[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    description: 'Full access for 30 days',
    amountPkr: 150,
    currency: 'PKR',
    durationDays: 30,
    features: ['Unlimited cases', 'Calendar & search', 'Email support'],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    description: 'Full access for 365 days — best value',
    amountPkr: 1400,
    currency: 'PKR',
    durationDays: 365,
    features: [
      'Unlimited cases',
      'Calendar & search',
      'Priority support',
      'Save vs monthly',
    ],
  },
];

export function getPlanById(planId: string): PlanDto | undefined {
  return PLANS.find((p) => p.id === planId);
}
