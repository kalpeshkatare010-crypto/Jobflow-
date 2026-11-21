import type { ReactNode } from 'react';
import { Wordmark } from '../app/layout/Logo';
import { formatPhone, mailtoLink, supportContact, whatsappLink } from '../app/support';

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Small print under the card, e.g. a link to another auth screen. */
  footer?: ReactNode;
}

/** Centered single-column layout for sign-in, sign-up and onboarding screens. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <div className="mb-8">
        <Wordmark />
      </div>
      <main className="w-full max-w-[400px]">
        <div className="animate-rise-in rounded-[var(--radius-card)] bg-surface p-6 sm:p-8">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-ink-500">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-ink-500">{footer}</div> : null}
      </main>
      <footer className="mt-auto pt-10 text-center text-[12px] text-ink-500">
        <SupportLine />
        <p>JobFlow is a product of RK Digitals.</p>
        <p className="mt-1">© 2026 RK Digitals. All rights reserved.</p>
      </footer>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
      {message}
    </p>
  );
}

/** Only allow in-app paths as a return address, never another site. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

/** "Need help?" with whichever support contacts are configured; nothing when none are. */
function SupportLine() {
  const contact = supportContact();
  if (!contact.email && !contact.whatsapp) return null;
  const link = 'font-medium text-info hover:underline';
  return (
    <p className="mb-3 text-[13px]">
      Need help signing in?{' '}
      {contact.email ? (
        <a className={`${link} break-all`} href={mailtoLink(contact.email, 'JobFlow sign-in help', '')}>
          {contact.email}
        </a>
      ) : null}
      {contact.email && contact.whatsapp ? ' or ' : null}
      {contact.whatsapp ? (
        <a className={link} href={whatsappLink(contact.whatsapp, 'Hi, I need help signing in to JobFlow.')} target="_blank" rel="noreferrer">
          WhatsApp {formatPhone(contact.whatsapp)}
        </a>
      ) : null}
    </p>
  );
}
