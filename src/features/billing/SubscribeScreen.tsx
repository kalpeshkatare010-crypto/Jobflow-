import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../../components/ui';
import { buttonStyles } from '../../components/ui/Button';
import { useAuth } from '../../auth/AuthProvider';
import { canManageTeam } from '../../auth/types';
import { formatRupees } from '../../domain/plans';
import { mailtoLink, supportContact, whatsappLink } from '../../app/support';
import { useAccess } from './access';

const INCLUDED = ['Your whole team, no login limit', 'Unlimited jobs, workflows and stock', 'Works offline on phone and web', 'Reports, backups and support'];

/** Shown in place of the screens once the free trial (or a paid month) is over. Shown once, in one place; never as a pop-up. */
export function SubscribeScreen() {
  const { activeWorkspace } = useAuth();
  const { pricePaise } = useAccess();
  const business = activeWorkspace?.name ?? 'your business';
  const canPay = canManageTeam(activeWorkspace?.role);
  const contact = supportContact();
  const price = formatRupees(pricePaise);
  const message = `Hi, I would like to subscribe to JobFlow (${price}/month) for ${business}.`;
  const wasTrial = activeWorkspace?.subscriptionStatus === 'trialing';

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-6">
      <Card>
        <h2 className="text-[19px] font-semibold">{wasTrial ? 'Your free trial has ended' : 'Your subscription has ended'}</h2>
        <p className="mt-2 text-[14px] text-ink-700">
          Everything you entered for {business} is saved and nothing is deleted.
          {canPay ? ' Subscribe to keep working where you left off.' : ` Ask the owner of ${business} to subscribe, and you can carry on.`}
        </p>

        {canPay ? (
          <>
            <p className="mt-5">
              <span className="tabular text-[28px] font-semibold">{price}</span>
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
            <div className="mt-5 flex flex-wrap gap-2">
              {contact.whatsapp ? (
                <a className={buttonStyles('primary')} href={whatsappLink(contact.whatsapp, message)} target="_blank" rel="noreferrer">
                  Subscribe on WhatsApp
                </a>
              ) : null}
              {contact.email ? (
                <a className={buttonStyles(contact.whatsapp ? 'secondary' : 'primary')} href={mailtoLink(contact.email, 'Subscribe to JobFlow', message)}>
                  Subscribe by email
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              Online card and UPI payment is not switched on yet. Message us and we will send the payment details, then switch your
              subscription on.
            </p>
          </>
        ) : null}
      </Card>
      <p className="text-center text-[12px] text-ink-500">
        You can still open <Link className="text-info hover:underline" to="/help">Help</Link> and{' '}
        <Link className="text-info hover:underline" to="/updates">Updates</Link>, or sign out from the menu at the top.
      </p>
    </div>
  );
}
