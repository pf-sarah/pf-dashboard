// ─── Shared hours resolution for "This Week" / "Weekly Schedule" linkage ────────
// One implementation reused by Design, Fulfillment, Preservation, and Resin so
// the fallback chain (explicit day override → standard weekly template →
// legacy pre-cutover weekly value → hardcoded per-member default → 0) can't
// drift between departments the way the daily-hours padding logic already had
// (the exact "pad untouched days with 0 instead of null" bug independently
// existed in all four departments before this module existed).

export type DailyHoursMap = Record<string, (number | null)[]>;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Splits a weekly total across 5 weekdays as evenly as possible (remainder
// goes to the earliest days), leaving Sat/Sun at 0. Used both to seed daily
// hours from a plain weekly number and to materialize a legacy weekly value
// into per-day overrides the first time any single day in that week is edited.
export function distributeHours(total: number): number[] {
  if (total <= 0) return [0, 0, 0, 0, 0, 0, 0];
  const base = Math.floor(total / 5);
  const rem  = Math.round(total) % 5;
  return Array.from({ length: 7 }, (_, i) => i < 5 ? (i < rem ? base + 1 : base) : 0);
}

export function resolveDayHours(
  dailyMap: DailyHoursMap,
  weekKey: string,
  dayIdx: number,
  standardWeeklyHours: number[] | undefined,
): { hours: number; isOverride: boolean } {
  const override = dailyMap[weekKey]?.[dayIdx];
  if (override != null) return { hours: override, isOverride: true };
  return { hours: standardWeeklyHours?.[dayIdx] ?? 0, isOverride: false };
}

// Full per-member-per-week fallback chain, highest to lowest priority:
//   1. Daily entries exist for this member+week -> sum of resolveDayHours (0-6)
//   2. No daily entries yet, but a legacy (pre-cutover) weekly value exists -> that value, as-is
//   3. Standard weekly template set on the roster -> sum(standardWeeklyHours)
//   4. Hardcoded per-member/week default (e.g. onboarding/offboarding ramps) -> that value
//   5. else 0
export function resolveWeekHours(params: {
  dailyMap: DailyHoursMap;
  weekKey: string;
  legacyWeeklyValue?: number;
  standardWeeklyHours?: number[];
  hardcodedDefault?: number;
}): number {
  const { dailyMap, weekKey, legacyWeeklyValue, standardWeeklyHours, hardcodedDefault } = params;
  const daily = dailyMap[weekKey];
  if (daily !== undefined) {
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += resolveDayHours(dailyMap, weekKey, d, standardWeeklyHours).hours;
    return sum;
  }
  if (legacyWeeklyValue !== undefined) return legacyWeeklyValue;
  if (standardWeeklyHours !== undefined) return standardWeeklyHours.reduce((s, h) => s + (h ?? 0), 0);
  return hardcodedDefault ?? 0;
}

// Returns the 7-element array a daily-hours setter should start mutating from
// for a given member+week: the already-stored array if one exists, otherwise
// — for the current week or earlier only — a freshly materialized array from
// any legacy weekly value (so fixing one day doesn't silently revert days
// that may already represent real worked hours back to "the template"),
// otherwise a fresh all-null array.
//
// currentWeekKey (the caller's isoMonday(0)) gates the legacy-materialize
// path to the current/past week specifically. A future week has no
// already-worked hours to protect — materializing a stale legacy default
// there (e.g. a flat pre-template placeholder repeated across dozens of
// future weeks) would freeze every other day in that week away from the
// template the moment just one day gets edited, defeating the template
// entirely for any future week that happens to carry one of these old
// numbers.
export function baseDailyArray(
  dailyMap: DailyHoursMap,
  weekKey: string,
  legacyWeeklyValue: number | undefined,
  currentWeekKey: string,
): (number | null)[] {
  const existing = dailyMap[weekKey];
  if (existing) return existing;
  const isCurrentOrPast = weekKey <= currentWeekKey;
  if (isCurrentOrPast && legacyWeeklyValue !== undefined && legacyWeeklyValue > 0) {
    return distributeHours(legacyWeeklyValue) as (number | null)[];
  }
  return [null, null, null, null, null, null, null];
}
