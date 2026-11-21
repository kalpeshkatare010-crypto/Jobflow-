export type Cell = string | number | boolean | null | undefined | Date;

/**
 * One CSV cell. Quotes when needed, and neutralises cells that a spreadsheet
 * would run as a formula (=, +, -, @, tab, return) so an exported customer
 * name like "=HYPERLINK(...)" cannot execute when the file is opened.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  else if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') text = value ? 'Yes' : 'No';
  else {
    text = value;
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A complete CSV file: header row, data rows, Windows line endings, UTF-8 mark so Excel shows ₹ and Marathi correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** A safe file name: letters, digits, dashes. */
export function csvFileName(base: string, from: string, to: string): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `jobflow-${slug}-${from}-to-${to}.csv`;
}
