'use client';

// Shared across all four scheduling departments (Design, Preservation,
// Fulfillment, Resin) so a roster member's day-by-day hours pattern is
// edited and auto-filled the same way everywhere.

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const EMPTY_DAILY_TEMPLATE: number[] = [0, 0, 0, 0, 0, 0, 0];

// Distribute total weekly hours evenly across Mon-Fri. Fallback used only when
// a roster member has no explicit dailyHoursTemplate set.
// e.g. 38hrs → [8,8,8,7,7,0,0]
export function distributeHours(total: number): number[] {
  if (total <= 0) return [0, 0, 0, 0, 0, 0, 0];
  const base = Math.floor(total / 5);
  const rem  = Math.round(total) % 5;
  return Array.from({ length: 7 }, (_, i) => i < 5 ? (i < rem ? base + 1 : base) : 0);
}

// If a member has an explicit daily template with hours on it, use it as-is;
// otherwise fall back to an even Mon-Fri split of their weekly total.
export function fillDailyHours(weeklyTotal: number, template?: number[]): number[] | null {
  if (template && template.some(h => h > 0)) return template;
  return weeklyTotal > 0 ? distributeHours(weeklyTotal) : null;
}

// Small inline Mon-Sun hours-per-day row for editing a roster member's default
// daily template — lets hours differ by day instead of assuming an even split.
export function DailyHoursTemplateEditor({ value, onChange }: { value?: number[]; onChange: (hours: number[]) => void }) {
  const hours = value && value.length === 7 ? value : EMPTY_DAILY_TEMPLATE;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-400 mr-0.5">Hrs/day:</span>
      {WEEKDAY_LETTERS.map((label, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] text-slate-300 leading-none">{label}</span>
          <input type="number" min="0" step="0.5" placeholder="0" title={WEEKDAY_NAMES[i]}
            value={hours[i] || ''}
            onChange={e => onChange(hours.map((h, di) => di === i ? (parseFloat(e.target.value) || 0) : h))}
            className="w-8 border border-slate-200 rounded px-0.5 py-0.5 text-[10px] text-center text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>
      ))}
    </div>
  );
}
