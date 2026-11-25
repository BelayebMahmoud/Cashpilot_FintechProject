import 'server-only';

/** Today's date ("YYYY-MM-DD") in the company timezone, for display helpers only. Business rules use the Clock port. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE ?? 'Africa/Tunis' }).format(new Date());
}
