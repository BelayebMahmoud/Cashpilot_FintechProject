/*
 * fr-TN display helpers. Amounts arrive as integer millimes and are formatted from their
 * integer and fractional parts separately — no float maths on money, even for display.
 */

const NARROW_NBSP = ' ';
const groupFormatter = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 });

/** "1 234" with fr grouping (narrow no-break spaces). */
function groupInt(n: number): string {
  return groupFormatter.format(n).replace(/[\s ]/g, NARROW_NBSP);
}

export interface MoneyFormatOptions {
  /** Prefix "+" for positive values. */
  signed?: boolean;
  /** Append " DT" (default true). */
  currency?: boolean;
}

/** 1234500 → "1 234,500 DT"; −20000 → "−20,000 DT" (true minus sign). */
export function formatMoney(millimes: number, opts: MoneyFormatOptions = {}): string {
  const negative = millimes < 0;
  const abs = Math.abs(millimes);
  const whole = Math.trunc(abs / 1000);
  const frac = String(abs % 1000).padStart(3, '0');
  const sign = negative ? '−' : opts.signed && millimes > 0 ? '+' : '';
  return `${sign}${groupInt(whole)},${frac}${opts.currency === false ? '' : `${NARROW_NBSP}DT`}`;
}

/** Amount without currency, for inputs: 1234500 → "1 234,500". */
export function formatMoneyInput(millimes: number): string {
  return formatMoney(millimes, { currency: false });
}

/** Axis labels: 5000000 → "5 k DT", −1200000 → "−1,2 k DT". Approximate by design. */
export function compactMoney(millimes: number): string {
  const dinars = millimes / 1000;
  const f = new Intl.NumberFormat('fr-TN', { notation: 'compact', maximumFractionDigits: 1 });
  return `${f.format(dinars).replace('-', '−').replace(/[\s ]/g, NARROW_NBSP)}${NARROW_NBSP}DT`;
}

/** Parses what a user types into a MoneyInput: "1 234,5" → 1234500. Returns null when invalid. */
export function parseMoneyInput(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,3})?$/.test(s)) return null;
  const negative = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const value = Number(i) * 1000 + Number(f.padEnd(3, '0'));
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

const dateFormatters = {
  short: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  medium: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  numeric: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }),
};

/** "2026-12-11" → "11 déc. 2026" (medium), "11 déc." (short), "11/12/2026" (numeric). */
export function formatDate(iso: string, style: keyof typeof dateFormatters = 'medium'): string {
  return dateFormatters[style].format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Date + time for audit logs, in the company timezone. */
export function formatDateTime(isoInstant: string, timeZone = 'Africa/Tunis'): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(isoInstant));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Relative due date for lists: "dans 5 j", "aujourd'hui", "en retard de 12 j". */
export function formatRelativeDue(dueIso: string, todayIso: string): string {
  const d = daysBetween(todayIso, dueIso);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  if (d > 0) return `dans ${d} j`;
  return `en retard de ${-d} j`;
}

export function formatPercentBp(bp: number | null): string {
  if (bp === null) return '—';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bp / 100)} %`;
}

export function formatQuantity(hundredths: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(hundredths / 100);
}
