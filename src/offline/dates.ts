import { ValidationError } from './customers';

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A YYYY-MM-DD date no later than tomorrow and no more than a year back (as the server checks). */
export function validateDate(value: string, today = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('date', 'Choose a date.');
  const yearAgo = new Date(today);
  yearAgo.setDate(yearAgo.getDate() - 366);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (value > isoDay(tomorrow) || value < isoDay(yearAgo)) throw new ValidationError('date', 'Choose a date within the last year.');
}
