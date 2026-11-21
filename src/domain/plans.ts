/**
 * Subscription plans. Prices are fixed by the owner (DECISIONS.md D-01) and
 * must match public.plans in supabase/migrations (a test checks this).
 * A null limit means unlimited.
 */
export interface Plan {
  code: 'starter' | 'professional';
  name: string;
  pricePaise: number;
  summary: string;
  limits: { logins: number | null; employees: number | null; workflows: number | null; openJobs: number | null };
}

export const PLANS: Plan[] = [
  {
    code: 'starter',
    name: 'Starter',
    pricePaise: 29900,
    summary: 'For a small shop getting its jobs off paper and WhatsApp.',
    limits: { logins: 3, employees: 15, workflows: 2, openJobs: 100 },
  },
  {
    code: 'professional',
    name: 'Professional',
    pricePaise: 59900,
    summary: 'For a growing unit with more people, products and jobs running at once.',
    limits: { logins: 10, employees: null, workflows: null, openJobs: null },
  },
];

export const TRIAL_DAYS = 14;

export function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

export function limitLabel(value: number | null): string {
  return value === null ? 'Unlimited' : String(value);
}

/** Days after the trial (or a missed payment) before the workspace becomes read-only. Matches tenants.offline_grace_days. */
export const GRACE_DAYS = 7;

export function planByCode(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export type SubscriptionNotice =
  | { kind: 'none' }
  | { kind: 'trial'; daysLeft: number; endsAt: Date }
  | { kind: 'trial_ending'; daysLeft: number; endsAt: Date }
  | { kind: 'grace'; readOnlyFrom: Date }
  | { kind: 'payment_due' }
  | { kind: 'read_only' };

const DAY = 86_400_000;

/** What to tell the business about its subscription, mirroring private.tenant_can_write. */
export function subscriptionNotice(
  ws: { subscriptionStatus: string; trialEndsAt: Date; isDemo?: boolean },
  now: Date,
): SubscriptionNotice {
  if (ws.isDemo || ws.subscriptionStatus === 'active') return { kind: 'none' };
  if (ws.subscriptionStatus === 'trialing') {
    const msLeft = ws.trialEndsAt.getTime() - now.getTime();
    if (msLeft > 0) {
      const daysLeft = Math.ceil(msLeft / DAY);
      return daysLeft <= 3 ? { kind: 'trial_ending', daysLeft, endsAt: ws.trialEndsAt } : { kind: 'trial', daysLeft, endsAt: ws.trialEndsAt };
    }
    const readOnlyFrom = new Date(ws.trialEndsAt.getTime() + GRACE_DAYS * DAY);
    return now < readOnlyFrom ? { kind: 'grace', readOnlyFrom } : { kind: 'read_only' };
  }
  // A missed payment keeps working for the grace period after the paid month ends (checked on the server).
  if (ws.subscriptionStatus === 'past_due') return { kind: 'payment_due' };
  return { kind: 'read_only' };
}
