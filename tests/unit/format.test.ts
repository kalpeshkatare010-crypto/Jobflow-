import { describe, expect, it } from 'vitest';
import { daysUntil, describeDue, formatNumber, formatRelativeTime, initials } from '../../src/lib/format';

describe('formatNumber', () => {
  it('uses Indian digit grouping by default', () => {
    expect(formatNumber(1250000)).toBe('12,50,000');
  });
  it('keeps up to the requested fraction digits', () => {
    expect(formatNumber(45.678, 'en-IN', 1)).toBe('45.7');
  });
});

describe('due dates', () => {
  const today = new Date(2026, 10, 20, 15, 30);
  it('counts calendar days, ignoring time of day', () => {
    expect(daysUntil(new Date(2026, 10, 21, 1, 0), today)).toBe(1);
    expect(daysUntil(new Date(2026, 10, 20, 23, 0), today)).toBe(0);
  });
  it('describes due and overdue dates in words', () => {
    expect(describeDue(new Date(2026, 10, 20), today)).toBe('Due today');
    expect(describeDue(new Date(2026, 10, 21), today)).toBe('Due tomorrow');
    expect(describeDue(new Date(2026, 10, 25), today)).toBe('Due in 5 days');
    expect(describeDue(new Date(2026, 10, 19), today)).toBe('1 day overdue');
    expect(describeDue(new Date(2026, 10, 17), today)).toBe('3 days overdue');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 10, 20, 12, 0);
  it('covers minutes, hours and days', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 20_000), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now.getTime() - 12 * 60_000), now)).toBe('12 min ago');
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatRelativeTime(new Date(now.getTime() - 50 * 3_600_000), now)).toBe('2 days ago');
  });
});

describe('initials', () => {
  it('takes first and last name initials', () => {
    expect(initials('Asha Kulkarni')).toBe('AK');
    expect(initials('  ravi  ')).toBe('R');
    expect(initials('Meena Prakash Rao')).toBe('MR');
  });
});
