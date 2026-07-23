// Canonical "week N from today" date helpers.
// Week offset 0 always means "this week" (Monday of the current week),
// recomputed relative to the current date — not a fixed calendar epoch.
// This is the single source of truth; do not duplicate this logic elsewhere.

export function getMondayDate(offsetWeeks: number): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoMonday(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toISOString().split('T')[0];
}

export function getWeekLabel(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getMonthKey(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Converts an arbitrary Date to the ISO date of the Monday of its week.
export function isoMondayFromDate(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

// Calendar date actuals tracking began — bounds how far back monthly rollups
// look for real "actual" data before falling back to the scheduled plan.
export const ACTUALS_TRACKING_START = '2025-12-29';

// Number of full weeks between ACTUALS_TRACKING_START and "this week" (offset 0).
// Used as the negative starting bound for 52-week schedules so already-completed
// months can be shown with real actuals instead of only projecting forward.
export function weeksSinceTrackingStart(): number {
  const start = new Date(ACTUALS_TRACKING_START + 'T12:00:00');
  const diffMs = getMondayDate(0).getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

// Sum of a "This Week" daily-hours array (Mon..Sun) into a single weekly total.
export function sumDaily(daily: number[] | undefined): number {
  return (daily ?? []).reduce((a, b) => a + (b || 0), 0);
}

// Distributes a new weekly total back down into a 7-day (Mon..Sun) breakdown.
// Scales the existing daily shape proportionally when one exists (so someone's
// heavier Monday stays heavier), otherwise splits evenly across that person's
// normal work days (Mon-Fri by default — pass workDayIndices for anyone with a
// non-standard week so hours never land on a day they're not scheduled). This
// keeps the daily "This Week" view and the weekly "Weekly Schedule" view in
// sync no matter which one was edited last.
export function distributeWeeklyToDaily(
  newTotal: number,
  existingDaily: number[] | undefined,
  workDayIndices: number[] = [0, 1, 2, 3, 4],
): number[] {
  const existing = Array.from({ length: 7 }, (_, i) => existingDaily?.[i] ?? 0);
  const existingTotal = existing.reduce((a, b) => a + b, 0);
  if (existingTotal > 0) {
    const scale = newTotal / existingTotal;
    return existing.map(h => Math.round(h * scale * 100) / 100);
  }
  const workDays = workDayIndices.length > 0 ? workDayIndices : [0, 1, 2, 3, 4];
  const perDay = Math.round((newTotal / workDays.length) * 100) / 100;
  const result = Array(7).fill(0);
  workDays.forEach(i => { if (i >= 0 && i <= 6) result[i] = perDay; });
  return result;
}
