/**
 * Formatting helpers. Indian digit grouping (1,00,000) is the default because
 * the first customers are in India; the locale is a parameter so a business
 * setting can change it later.
 */
export const DEFAULT_LOCALE = 'en-IN';

export function formatNumber(value: number, locale: string = DEFAULT_LOCALE, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** Quantity with its unit, e.g. "1,200 pcs" or "45.5 kg". */
export function formatQuantity(value: number, unit: string, locale: string = DEFAULT_LOCALE): string {
  return `${formatNumber(value, locale, 3)} ${unit}`;
}

export function formatPercent(fraction: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

/** "20 Nov" (adds the year only when it differs from `today`). */
export function formatShortDate(date: Date, today: Date = new Date(), locale: string = DEFAULT_LOCALE): string {
  const sameYear = date.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `today` to `date` (negative when in the past). */
export function daysUntil(date: Date, today: Date = new Date()): number {
  return Math.round((startOfDay(date) - startOfDay(today)) / DAY_MS);
}

/** "Due today", "Due in 3 days", "2 days overdue". */
export function describeDue(date: Date, today: Date = new Date()): string {
  const days = daysUntil(date, today);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
