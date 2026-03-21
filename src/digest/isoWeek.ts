/**
 * ISO 8601 week number and week-year in **UTC** (digest filenames).
 * Week 1 is the week with the first Thursday of the calendar year.
 */

export function utcIsoWeekYear(d: Date): number {
  const t = new Date(d.getTime());
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  return t.getUTCFullYear();
}

export function utcIsoWeekNumber(d: Date): number {
  const t = new Date(d.getTime());
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = t.getTime();
  t.setUTCMonth(0, 1);
  if (t.getUTCDay() !== 4) {
    t.setUTCMonth(0, 1 + ((4 - t.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - t.getTime()) / 604800000);
}

export function utcDigestWeekId(d: Date): string {
  const y = utcIsoWeekYear(d);
  const w = utcIsoWeekNumber(d);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
