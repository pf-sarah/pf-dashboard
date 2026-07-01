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
