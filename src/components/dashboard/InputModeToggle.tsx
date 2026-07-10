// ─── Hours ⇄ output (frames/orders/units) input toggle ──────────────────────────
// Lets a schedule table be edited either in raw hours (the canonical stored
// value) or in output units (frames/orders/units), back-converting through
// each person's ratio (hours per unit of output) before it's persisted as hours.

export type InputMode = 'hours' | 'output';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function hoursFromOutput(output: number, ratio: number): number {
  return ratio > 0 ? output * ratio : 0;
}

export function InputModeToggle({ mode, onChange, unitLabel }: { mode: InputMode; onChange: (m: InputMode) => void; unitLabel: string }) {
  return (
    <div className="flex items-center rounded-md border border-slate-200 overflow-hidden text-[11px] shrink-0">
      <button type="button" onClick={() => onChange('hours')}
        className={`px-2 py-1 font-medium transition-colors ${mode === 'hours' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
        Hours
      </button>
      <button type="button" onClick={() => onChange('output')}
        className={`px-2 py-1 font-medium transition-colors ${mode === 'output' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
        {unitLabel}
      </button>
    </div>
  );
}
