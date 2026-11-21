/**
 * Support contact details come from the build settings, never from the code,
 * so no contact detail is invented. Unset values hide that contact option.
 *   VITE_SUPPORT_EMAIL     e.g. support@yourdomain.in
 *   VITE_SUPPORT_WHATSAPP  phone number with country code, digits only, e.g. 9198xxxxxxxx
 */
export interface SupportContact {
  email: string | null;
  whatsapp: string | null;
}

export function supportContact(): SupportContact {
  const email = (import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim();
  const whatsapp = (import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  return {
    email: /^\S+@\S+\.\S+$/.test(email) ? email : null,
    whatsapp: whatsapp.length >= 10 ? whatsapp : null,
  };
}

export interface ReportContext {
  version: string;
  mode: 'demo' | 'connected';
  business: string | null;
  role: string | null;
  sync: string;
  page: string;
  device: string;
  time: Date;
}

/** Plain-text details attached to a support request. Contains no passwords or keys. */
export function problemReport(ctx: ReportContext, description: string): string {
  return [
    description.trim() || '(No description given)',
    '',
    '--- Details for support ---',
    `JobFlow version: ${ctx.version}`,
    `Mode: ${ctx.mode === 'demo' ? 'Demo (not connected)' : 'Connected'}`,
    `Business: ${ctx.business ?? '-'}`,
    `Role: ${ctx.role ?? '-'}`,
    `Sync: ${ctx.sync}`,
    `Screen: ${ctx.page}`,
    `Device: ${ctx.device}`,
    `Time: ${ctx.time.toISOString()}`,
  ].join('\n');
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
