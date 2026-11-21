import { useState } from 'react';
import { Link } from 'react-router';
import { Check, X } from 'lucide-react';
import { Badge, Card, CardHeader } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { canManageTeam } from '../../auth/types';
import { formatRupees, PLAN, TRIAL_DAYS, type SubscriptionNotice } from '../../domain/plans';
import { mailtoLink, supportContact, whatsappLink } from '../../app/support';
import { readPreference, writePreference } from '../../lib/storage';
import { useAccess } from './access';

const INCLUDED = ['Your whole team, no login limit', 'Unlimited jobs, workflows and stock', 'Works offline on phone and web', 'Reports, backups and support'];

const date = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Plan and billing. Online payment is not switched on (needs the owner's approval of a provider). */
export function PlanSection() {
  const { status, activeWorkspace } = useAuth();
  const access = useAccess();
  const demo = status === 'demo' || !activeWorkspace;

  if (!demo && access.complimentary) {
    return (
      <section id="plan" aria-label="Plan and billing" className="scroll-mt-4">
        <Card>
          <CardHeader title="Plan and billing" />
          <p className="text-[13px] text-ink-700">This is your own business. JobFlow is free here and there is nothing to pay.</p>
        </Card>
      </section>
    );
  }

  const contact = supportContact();
  const price = formatRupees(access.pricePaise);
  const message = `Hi, I would like to subscribe to JobFlow (${price}/month)${activeWorkspace ? ` for ${activeWorkspace.name}` : ''}.`;

  return (
    <section id="plan" aria-label="Plan and billing" className="scroll-mt-4">
      <Card>
        <CardHeader title="Plan and billing" description={demo ? `Every new business starts with a ${TRIAL_DAYS}-day free trial. No card needed.` : undefined} />
        {!demo ? (
          <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-700">
            <StatusBadge kind={access.notice.kind} />
            {describe(access.notice)}
          </p>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-line p-4">
          <p className="text-[15px] font-semibold">{PLAN.name}</p>
          <p className="mt-1">
            <span className="tabular text-[24px] font-semibold">{price}</span>
            <span className="text-[13px] text-ink-500"> per month, for the whole business</span>
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check aria-hidden className="size-3.5 text-good" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 text-[13px] text-ink-700">
          <p>Online payment is not switched on yet. To subscribe, message us and we will send the payment details and switch it on.</p>
          {contact.email || contact.whatsapp ? (
            <p className="mt-2 flex flex-wrap gap-3">
              {contact.whatsapp ? (
                <a className="font-medium text-info hover:underline" href={whatsappLink(contact.whatsapp, message)} target="_blank" rel="noreferrer">
                  WhatsApp us
                </a>
              ) : null}
              {contact.email ? (
                <a className="font-medium text-info hover:underline" href={mailtoLink(contact.email, 'Subscribe to JobFlow', message)}>
                  Email us
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function describe(notice: SubscriptionNotice): string {
  switch (notice.kind) {
    case 'trial':
    case 'trial_ending':
      return `Free trial, ${days(notice.daysLeft)} left (until ${date(notice.endsAt)}).`;
    case 'payment_due':
      return 'A payment is due. JobFlow keeps working for a few more days.';
    case 'ended':
      return 'The subscription has ended. Your data is safe.';
    default:
      return 'Your subscription is active.';
  }
}

function StatusBadge({ kind }: { kind: SubscriptionNotice['kind'] }) {
  if (kind === 'none') return <Badge tone="good">Active</Badge>;
  if (kind === 'trial' || kind === 'trial_ending') return <Badge tone="info">Free trial</Badge>;
  if (kind === 'payment_due') return <Badge tone="warning">Payment due</Badge>;
  return <Badge tone="neutral">Ended</Badge>;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * One slim line above the screens, only in the last 3 days of the trial or when
 * a payment is due. It can be hidden for the day. Never shown to the JobFlow owner.
 */
export function SubscriptionBanner() {
  const { status, activeWorkspace } = useAuth();
  const { notice, complimentary } = useAccess();
  const [hidden, setHidden] = useState(() => readPreference('subscriptionBannerHidden', '') === todayKey());
  if (status !== 'signed_in' || !activeWorkspace || complimentary || hidden) return null;
  if (notice.kind !== 'trial_ending' && notice.kind !== 'payment_due') return null;
  const canPay = canManageTeam(activeWorkspace.role);
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-sunken px-4 py-2.5 text-[13px] text-ink-900">
      <span>
        {notice.kind === 'trial_ending' ? `Your free trial ends in ${days(notice.daysLeft)}.` : 'A payment is due.'}{' '}
        {canPay ? (
          <Link to="/settings#plan" className="font-medium text-info hover:underline">
            See plan
          </Link>
        ) : (
          'Please tell the business owner.'
        )}
      </span>
      <button
        type="button"
        aria-label="Hide for today"
        className="rounded p-1 text-ink-500 hover:text-ink-900"
        onClick={() => {
          writePreference('subscriptionBannerHidden', todayKey());
          setHidden(true);
        }}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** A quiet line for the sidebar during the trial, e.g. "Free trial: 9 days left". */
export function useTrialLine(): string | null {
  const { status } = useAuth();
  const { notice, complimentary } = useAccess();
  if (status !== 'signed_in' || complimentary) return null;
  if (notice.kind === 'trial' || notice.kind === 'trial_ending') return `Free trial: ${days(notice.daysLeft)} left`;
  return null;
}
