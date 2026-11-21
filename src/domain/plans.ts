/**
 * JobFlow has one plan (DECISIONS.md D-36): ₹999 per business per month, no
 * limits, after a 14-day free trial. Must match public.plans (a test checks).
 */
export interface Plan {
  code: 'standard';
  name: string;
  pricePaise: number;
  summary: string;
}

export const PLAN: Plan = {
  code: 'standard',
  name: 'JobFlow',
  pricePaise: 99900,
  summary: 'Everything in JobFlow for your whole business: unlimited people, workflows and jobs.',
};

export const PLANS: Plan[] = [PLAN];

export const TRIAL_DAYS = 14;

/** Days after a paid month ends (or a payment is missed) before JobFlow pauses. Matches private.tenant_can_write. */
export const PAYMENT_GRACE_DAYS = 3;

export function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

export function planByCode(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export type SubscriptionNotice =
  | { kind: 'none' }
  | { kind: 'trial'; daysLeft: number; endsAt: Date }
  | { kind: 'trial_ending'; daysLeft: number; endsAt: Date }
  | { kind: 'payment_due' }
  | { kind: 'ended' };

const DAY = 86_400_000;

export interface AccessFacts {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  periodEnd?: Date | null;
  complimentary?: boolean;
  isDemo?: boolean;
}

/** Whether the business can use JobFlow now. Mirrors private.tenant_can_write on the server. */
export function canUseNow(ws: AccessFacts, now: Date): boolean {
  if (ws.isDemo || ws.complimentary) return true;
  const graceEnd = ws.periodEnd ? ws.periodEnd.getTime() + PAYMENT_GRACE_DAYS * DAY : null;
  switch (ws.subscriptionStatus) {
    case 'trialing':
      return ws.trialEndsAt !== null && now.getTime() < ws.trialEndsAt.getTime();
    case 'active':
      return graceEnd === null || now.getTime() < graceEnd;
    case 'past_due':
      return graceEnd !== null && now.getTime() < graceEnd;
    default:
      return false;
  }
}

/** What to tell the business about its subscription. */
export function subscriptionNotice(ws: AccessFacts, now: Date): SubscriptionNotice {
  if (ws.isDemo || ws.complimentary) return { kind: 'none' };
  if (!canUseNow(ws, now)) return { kind: 'ended' };
  if (ws.subscriptionStatus === 'trialing' && ws.trialEndsAt) {
    const daysLeft = Math.max(1, Math.ceil((ws.trialEndsAt.getTime() - now.getTime()) / DAY));
    return daysLeft <= 3 ? { kind: 'trial_ending', daysLeft, endsAt: ws.trialEndsAt } : { kind: 'trial', daysLeft, endsAt: ws.trialEndsAt };
  }
  if (ws.subscriptionStatus === 'past_due') return { kind: 'payment_due' };
  return { kind: 'none' };
}
