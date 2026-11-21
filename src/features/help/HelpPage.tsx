import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Check, ChevronDown, Copy, Mail, MessageCircle } from 'lucide-react';
import { Button, buttonStyles, Card, CardHeader, Textarea } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { ROLE_LABEL } from '../../auth/types';
import { useLocalData } from '../../offline/LocalDataProvider';
import { describeSync } from '../../app/layout/SyncIndicator';
import { mailtoLink, problemReport, supportContact, whatsappLink } from '../../app/support';
import { cn } from '../../lib/cn';

interface Question {
  q: string;
  a: ReactNode;
}

const QUESTIONS: Question[] = [
  {
    q: 'Does JobFlow work without internet?',
    a: 'Yes. Everything you add or change is saved on this phone or computer first, and sent to the cloud when you are online again. The round sync icon at the top tells you which: "Saved on this device" means not sent yet; "All changes synced" means it is in the cloud.',
  },
  {
    q: 'How do I start using it for my factory?',
    a: (
      <>
        Three steps: <Link className="text-info hover:underline" to="/workflows">create a workflow</Link> with your own stage
        names (for example Cutting, Bending, Packing), <Link className="text-info hover:underline" to="/customers">add a customer</Link>,
        then <Link className="text-info hover:underline" to="/jobs">create a job</Link> for that customer. The job copies the
        workflow&apos;s stages, and you tap Start and Done as work moves along.
      </>
    ),
  },
  {
    q: 'Why does a job say "Not numbered yet"?',
    a: 'Job numbers (like JOB-0001) are given by the server, so two phones working offline can never pick the same number. The number appears as soon as the job syncs.',
  },
  {
    q: 'Two people changed the same job. Whose change wins?',
    a: 'Changes to different details are both kept. If two people changed the same detail at the same time, the first one to reach the server is kept, and the other person sees a notice on that job explaining what happened. Nothing is overwritten silently.',
  },
  {
    q: 'How do I add my team?',
    a: (
      <>
        Owners and admins go to <Link className="text-info hover:underline" to="/settings">Settings</Link> → Team and send an
        invitation link. Shop-floor workers who never sign in can simply be added under{' '}
        <Link className="text-info hover:underline" to="/employees">Employees</Link>.
      </>
    ),
  },
  {
    q: 'What can each role do?',
    a: 'Owner and Admin: everything, including the team and reopening closed jobs. Production manager: customers, workflows, jobs and stages. Employee: works on job stages; extra permissions can be switched on by the owner.',
  },
  {
    q: 'I cannot sign in.',
    a: 'On the sign-in screen use "Forgot your password?", or "Email me a sign-in code instead" to sign in with a one-time code sent to your email. Check your spam folder if the email does not arrive within a minute.',
  },
  {
    q: 'What is demo mode?',
    a: 'When this copy of JobFlow is not connected to a database, the header shows "Not connected". You can try every screen, but what you add stays on this device only.',
  },
];

export function HelpPage() {
  const { status, activeWorkspace } = useAuth();
  const { syncState } = useLocalData();
  const location = useLocation();
  const contact = supportContact();
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);

  const report = () =>
    problemReport(
      {
        version: __APP_VERSION__,
        mode: status === 'demo' ? 'demo' : 'connected',
        business: activeWorkspace?.name ?? null,
        role: activeWorkspace ? ROLE_LABEL[activeWorkspace.role] : null,
        sync: describeSync(syncState).label,
        page: location.pathname,
        device: navigator.userAgent,
        time: new Date(),
      },
      description,
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const subject = `JobFlow help${activeWorkspace ? `: ${activeWorkspace.name}` : ''}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="min-w-0 lg:col-span-7">
        <CardHeader title="Common questions" />
        <div className="flex flex-col divide-y divide-line">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-ink-900">
                {item.q}
                <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 text-[13px] leading-relaxed text-ink-700">{item.a}</div>
            </details>
          ))}
        </div>
      </Card>

      <Card className="min-w-0 lg:col-span-5">
        <CardHeader title="Contact support" description="Tell us what happened. Your app details are added so we can help faster." />
        <div className="flex flex-col gap-3">
          <Textarea
            label="What went wrong?"
            rows={4}
            placeholder="For example: the job I created this morning is not showing on my partner's phone."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {contact.email ? (
              <a className={cn(buttonStyles('primary'), 'gap-2')} href={mailtoLink(contact.email, subject, report())}>
                <Mail aria-hidden className="size-4" />
                Email support
              </a>
            ) : null}
            {contact.whatsapp ? (
              <a
                className={cn(buttonStyles(contact.email ? 'secondary' : 'primary'), 'gap-2')}
                href={whatsappLink(contact.whatsapp, report())}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle aria-hidden className="size-4" />
                WhatsApp support
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => void copy()} icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}>
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>
          {!contact.email && !contact.whatsapp ? (
            <p className="text-[12px] text-ink-500">
              Support contact details have not been set up for this copy of JobFlow yet. Copy the details and send them to
              the person who set up JobFlow for you.
            </p>
          ) : null}
          <p className="text-[12px] text-ink-500">
            Details sent: app version, business name, your role, sync status, screen and device type. Never passwords.
          </p>
        </div>
      </Card>
    </div>
  );
}
