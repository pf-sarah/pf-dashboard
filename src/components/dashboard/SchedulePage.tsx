'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useScheduleSettings } from './useScheduleSettings';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PayType = 'hourly' | 'salary';

interface Designer {
  id:           string;
  name:         string;
  ratio:        number;
  payType:      PayType;
  hourlyRate:   number;
  annualSalary: number;
}

interface WeekSchedule {
  [designerId: string]: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WEEKS              = 52;
const WINDOW             = 8;
const PRESERVATION_WEEKS = 6;

// ─── Historical Utah intake (actual received by week) ─────────────────────────
const UTAH_HISTORICAL_INTAKE: { weekOf: string; actual: number }[] = [
  { weekOf: '2025-09-29', actual: 187 },
  { weekOf: '2025-10-06', actual: 167 },
  { weekOf: '2025-10-13', actual: 192 },
  { weekOf: '2025-10-20', actual: 159 },
  { weekOf: '2025-10-27', actual: 139 },
  { weekOf: '2025-11-03', actual: 97  },
  { weekOf: '2025-11-10', actual: 110 },
  { weekOf: '2025-11-17', actual: 68  },
  { weekOf: '2025-11-24', actual: 39  },
  { weekOf: '2025-12-01', actual: 15  },
  { weekOf: '2025-12-08', actual: 29  },
  { weekOf: '2025-12-15', actual: 41  },
  { weekOf: '2025-12-22', actual: 16  },
  { weekOf: '2025-12-29', actual: 24  },
  { weekOf: '2026-01-05', actual: 22  },
  { weekOf: '2026-01-12', actual: 18  },
  { weekOf: '2026-01-19', actual: 22  },
  { weekOf: '2026-01-26', actual: 12  },
  { weekOf: '2026-02-02', actual: 10  },
  { weekOf: '2026-02-09', actual: 25  },
  { weekOf: '2026-02-16', actual: 27  },
  { weekOf: '2026-02-23', actual: 24  },
  { weekOf: '2026-03-02', actual: 13  },
  { weekOf: '2026-03-09', actual: 28  },
  { weekOf: '2026-03-16', actual: 47  },
  { weekOf: '2026-03-23', actual: 43  },
  { weekOf: '2026-03-30', actual: 31  },
];

// ─── Historical Georgia intake (actual received by week) ──────────────────────
const GEORGIA_HISTORICAL_INTAKE: { weekOf: string; actual: number }[] = [
  { weekOf: '2025-09-22', actual: 67  }, // wk 39
  { weekOf: '2025-09-29', actual: 176 }, // wk 40
  { weekOf: '2025-10-06', actual: 200 }, // wk 41
  { weekOf: '2025-10-13', actual: 170 }, // wk 42
  { weekOf: '2025-10-20', actual: 165 }, // wk 43
  { weekOf: '2025-10-27', actual: 127 }, // wk 44
  { weekOf: '2025-11-03', actual: 105 }, // wk 45
  { weekOf: '2025-11-10', actual: 137 }, // wk 46
  { weekOf: '2025-11-17', actual: 95  }, // wk 47
  { weekOf: '2025-11-24', actual: 57  }, // wk 48
  { weekOf: '2025-12-01', actual: 40  }, // wk 49
  { weekOf: '2025-12-08', actual: 47  }, // wk 50
  { weekOf: '2025-12-15', actual: 66  }, // wk 51
  { weekOf: '2025-12-22', actual: 33  }, // wk 52
  { weekOf: '2025-12-29', actual: 41  }, // wk 1 2026
  { weekOf: '2026-01-05', actual: 35  }, // wk 2
  { weekOf: '2026-01-12', actual: 16  }, // wk 3
  { weekOf: '2026-01-19', actual: 31  }, // wk 4
  { weekOf: '2026-01-26', actual: 12  }, // wk 5
  { weekOf: '2026-02-02', actual: 31  }, // wk 6
  { weekOf: '2026-02-09', actual: 23  }, // wk 7
  { weekOf: '2026-02-16', actual: 27  }, // wk 8
  { weekOf: '2026-02-23', actual: 30  }, // wk 9
  { weekOf: '2026-03-02', actual: 32  }, // wk 10
  { weekOf: '2026-03-09', actual: 48  }, // wk 11
  { weekOf: '2026-03-16', actual: 63  }, // wk 12
  { weekOf: '2026-03-23', actual: 49  }, // wk 13
  { weekOf: '2026-03-30', actual: 56  }, // wk 14 (current, projected)
];

// ─── Default designers ────────────────────────────────────────────────────────

const DEFAULT_UTAH_DESIGNERS: Designer[] = [
  { id: 'ut-mgr', name: 'Jennika Merrill',  ratio: 1.4, payType: 'salary', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-1',   name: 'Deanna L Brown',   ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-2',   name: 'Sarah Glissmeyer', ratio: 1.8, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-3',   name: 'Kathryn Hill',     ratio: 1.4, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-4',   name: 'Mia Legas',        ratio: 1.2, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-5',   name: 'Sloane James',     ratio: 1.2, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-6',   name: 'Audrey Brown',     ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ut-7',   name: 'Chloe Leonard',    ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
];

const DEFAULT_GEORGIA_DESIGNERS: Designer[] = [
  { id: 'ga-1', name: 'Katherine Piper', ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ga-2', name: 'Allanna Harlan',  ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ga-3', name: 'Erin Webb',       ratio: 2.3, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ga-4', name: 'Rachel Tucker',   ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
  { id: 'ga-5', name: 'Celt Stewart',    ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
];

function buildDefaultUtahSchedule(): WeekSchedule[] {
  return Array.from({ length: WEEKS }, (_, w) => ({
    'ut-mgr': 15,
    'ut-1':   w === 5 ? 0 : 28,
    'ut-2':   15,
    'ut-3':   20,
    'ut-4':   16,
    'ut-5':   w <= 12 ? 20 : 0,
    'ut-6':   w <= 4  ? 10 : 0,
    'ut-7':   0,
  }));
}

function buildDefaultGeorgiaSchedule(): WeekSchedule[] {
  return Array.from({ length: WEEKS }, () => ({
    'ga-1': 0, 'ga-2': 0, 'ga-3': 0, 'ga-4': 0, 'ga-5': 0,
  }));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMondayDate(offsetWeeks: number): Date {
  const d   = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoMonday(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toISOString().split('T')[0];
}

function getWeekLabel(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthKey(offsetWeeks: number): string {
  return getMondayDate(offsetWeeks).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Returns the past N week Monday ISO dates (most recent first)
function pastWeeks(n: number): string[] {
  return Array.from({ length: n }, (_, i) => isoMonday(-(i + 1)));
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function turnaroundColors(totalWeeks: number | null, overstaffed: boolean) {
  if (totalWeeks === null) return { bar: 'bg-red-400',    text: 'text-red-700',    label: 'queue not cleared in 52 wks' };
  if (overstaffed)         return { bar: 'bg-orange-400', text: 'text-orange-700', label: `~${totalWeeks} wks — overstaffed` };
  if (totalWeeks <= 10)    return { bar: 'bg-green-400',  text: 'text-green-700',  label: `~${totalWeeks} wks — ideal` };
  if (totalWeeks <= 18)    return { bar: 'bg-amber-400',  text: 'text-amber-700',  label: `~${totalWeeks} wks — backlog building` };
  return                          { bar: 'bg-red-600',    text: 'text-red-800',    label: `~${totalWeeks} wks — large backlog` };
}

// ─── RosterEditor ──────────────────────────────────────────────────────────────

function RosterEditor({ designers, onChange, onAdd, onRemove }: {
  designers: Designer[];
  onChange:  (id: string, field: keyof Designer, value: string) => void;
  onAdd:     () => void;
  onRemove:  (id: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_80px_80px_110px_130px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
        <span>Name</span>
        <span className="text-center">Pay type</span>
        <span className="text-center">Ratio</span>
        <span className="text-center">Hourly rate</span>
        <span className="text-center">Annual salary</span>
        <span />
      </div>
      <div className="space-y-2">
        {designers.map(d => (
          <div key={d.id} className="grid grid-cols-[1fr_80px_80px_110px_130px_20px] gap-2 items-center">
            <input type="text" value={d.name} onChange={e => onChange(d.id, 'name', e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <select value={d.payType} onChange={e => onChange(d.id, 'payType', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
            <input type="number" value={d.ratio} step="0.1" min="0.1"
              onChange={e => onChange(d.id, 'ratio', e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={d.hourlyRate || ''} step="0.50" min="0" placeholder="0"
                disabled={d.payType === 'salary'}
                onChange={e => onChange(d.id, 'hourlyRate', e.target.value)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={d.annualSalary || ''} step="1000" min="0" placeholder="e.g. 52000"
                disabled={d.payType === 'hourly'}
                onChange={e => onChange(d.id, 'annualSalary', e.target.value)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <button onClick={() => onRemove(d.id)} className="text-slate-300 hover:text-red-400 transition-colors text-xl leading-none text-center">×</button>
          </div>
        ))}
      </div>
      <button onClick={onAdd}
        className="mt-3 text-xs px-3 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 transition-colors">
        + Add designer
      </button>
      <p className="mt-3 text-xs text-slate-400">
        <strong>Salary:</strong> enter annual — divided by 52 for weekly CPO.&nbsp;
        <strong>Hourly:</strong> cost = hours × rate.
      </p>
    </div>
  );
}

// ─── HistoricalsTab ────────────────────────────────────────────────────────────

function HistoricalsTab({ designers, location, teamActuals, onActualsSaved }: {
  designers:      Designer[];
  location:       'Utah' | 'Georgia';
  teamActuals:    { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved: () => void;
}) {
  const HIST_WEEKS  = 12;
  const weekOptions = pastWeeks(HIST_WEEKS);
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[0]);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');

  // Local edits before saving
  const [localEdits, setLocalEdits] = useState<Record<string, { hours: number; frames: number }>>({});

  // Merge Supabase actuals with local edits for display
  function getEntry(designerId: string, name: string) {
    if (localEdits[designerId]) return localEdits[designerId];
    const row = teamActuals.find(r =>
      r.department === 'design' &&
      r.week_of === selectedWeek &&
      r.member_name === name
    );
    return { hours: row?.actual_hours ?? 0, frames: row?.actual_orders ?? 0 };
  }

  function setEntry(designerId: string, field: 'hours' | 'frames', val: number) {
    setLocalEdits(prev => ({
      ...prev,
      [designerId]: { ...getEntry(designerId, designers.find(d => d.id === designerId)?.name ?? ''), [field]: val },
    }));
  }

  async function saveWeek() {
    setSaving(true);
    setSaveMsg('');
    try {
      const saves = designers.map(d => {
        const entry = getEntry(d.id, d.name);
        if (entry.hours === 0 && entry.frames === 0) return Promise.resolve();
        return fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'team', location, weekOf: selectedWeek,
            department: 'design', memberName: d.name,
            actualHours: entry.hours, actualOrders: entry.frames,
          }),
        });
      });
      await Promise.all(saves);
      setLocalEdits({});
      setSaveMsg('Saved');
      onActualsSaved();
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Save failed'); }
    setSaving(false);
  }

  const weekData = designers.map(d => {
    const entry = getEntry(d.id, d.name);
    const ratio = entry.hours > 0 && entry.frames > 0 ? entry.hours / entry.frames : null;
    const cost  = d.payType === 'salary' ? d.annualSalary / 52 : entry.hours * d.hourlyRate;
    const cpo   = entry.frames > 0 && cost > 0 ? cost / entry.frames : null;
    return { designer: d, hours: entry.hours, frames: entry.frames, ratio, cost, cpo };
  });

  const teamFrames = weekData.reduce((s, r) => s + r.frames, 0);
  const teamHours  = weekData.reduce((s, r) => s + r.hours,  0);
  const teamCost   = weekData.reduce((s, r) => s + r.cost,   0);
  const teamRatio  = teamFrames > 0 && teamHours > 0 ? teamHours / teamFrames : null;
  const teamCPO    = teamFrames > 0 && teamCost  > 0 ? teamCost  / teamFrames : null;
  const hasCost    = designers.some(d =>
    (d.payType === 'hourly' && d.hourlyRate > 0) || (d.payType === 'salary' && d.annualSalary > 0)
  );

  // Monthly summary across all loaded actuals
  const monthlyByDesigner = useMemo(() => {
    const map: Record<string, Record<string, { frames: number; hours: number; cost: number }>> = {};
    teamActuals
      .filter(r => r.department === 'design')
      .forEach(r => {
        const monthKey = new Date(r.week_of + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const d = designers.find(d => d.name === r.member_name);
        if (!d) return;
        if (!map[monthKey]) map[monthKey] = {};
        if (!map[monthKey][d.id]) map[monthKey][d.id] = { frames: 0, hours: 0, cost: 0 };
        map[monthKey][d.id].frames += r.actual_orders;
        map[monthKey][d.id].hours  += r.actual_hours;
        map[monthKey][d.id].cost   += r.actual_hours * (d.hourlyRate ?? 0);
      });
    return map;
  }, [teamActuals, designers]);

  return (
    <div className="space-y-5">
      {/* Week selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-slate-500">Week of</label>
        <select value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setLocalEdits({}); }}
          className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
          {weekOptions.map(w => (
            <option key={w} value={w}>{fmtDate(w)} – {fmtDate(addDays(w, 6))}</option>
          ))}
        </select>
        <button onClick={() => void saveWeek()} disabled={saving}
          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save week actuals'}
        </button>
        {saveMsg && <span className={`text-xs ${saveMsg === 'Saved' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</span>}
        <span className="text-xs text-slate-400 italic">Enter actual frames and hours for each designer, then save.</span>
      </div>

      {/* Per-designer actuals table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Week of {fmtDate(selectedWeek)}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Enter actual frames completed and hours worked. Saved to shared database.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2 text-left font-medium text-slate-500">Designer</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual frames</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual hours</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual ratio</th>
                {hasCost && <th className="px-3 py-2 text-center font-medium text-slate-500">Labor cost</th>}
                {hasCost && <th className="px-3 py-2 text-center font-medium text-slate-500">Actual CPO</th>}
              </tr>
            </thead>
            <tbody>
              {weekData.map((row, i) => (
                <tr key={row.designer.id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                    {row.designer.name}
                    {row.designer.payType === 'salary' && (
                      <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 rounded px-1 py-px">salary</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={row.frames || ''} min="0" placeholder="0"
                      onChange={e => setEntry(row.designer.id, 'frames', parseInt(e.target.value) || 0)}
                      className="w-16 border border-slate-200 rounded px-2 py-1 text-center text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={row.hours || ''} min="0" step="0.5" placeholder="0"
                      onChange={e => setEntry(row.designer.id, 'hours', parseFloat(e.target.value) || 0)}
                      className="w-16 border border-slate-200 rounded px-2 py-1 text-center text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.ratio !== null ? (
                      <span className={`font-semibold ${row.ratio <= 1.4 ? 'text-green-700' : row.ratio <= 1.8 ? 'text-amber-700' : 'text-red-700'}`}>
                        {row.ratio.toFixed(2)} h/f
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  {hasCost && <td className="px-3 py-2 text-center text-slate-500">{row.cost > 0 ? fmt$(row.cost) : '—'}</td>}
                  {hasCost && <td className="px-3 py-2 text-center">{row.cpo !== null ? <span className="font-semibold text-amber-700">{fmt$(row.cpo)}</span> : '—'}</td>}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-indigo-50/30 font-semibold">
                <td className="px-4 py-2 text-slate-700">Team total</td>
                <td className="px-3 py-2 text-center text-indigo-700">{teamFrames || '—'}</td>
                <td className="px-3 py-2 text-center text-slate-700">{teamHours || '—'}</td>
                <td className="px-3 py-2 text-center">
                  {teamRatio !== null ? <span className={teamRatio <= 1.5 ? 'text-green-700' : teamRatio <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{teamRatio.toFixed(2)} h/f</span> : '—'}
                </td>
                {hasCost && <td className="px-3 py-2 text-center text-slate-600">{teamCost > 0 ? fmt$(teamCost) : '—'}</td>}
                {hasCost && <td className="px-3 py-2 text-center text-amber-700">{teamCPO !== null ? fmt$(teamCPO) : '—'}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* All-weeks overview */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">All weeks overview</h3>
          <p className="text-xs text-slate-400 mt-0.5">Populated as you save each week. Shared across all logged-in users.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Designer</th>
                {weekOptions.map(w => (
                  <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[100px]">
                    {fmtDate(w).split(',')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {designers.map((d, di) => (
                <tr key={d.id} className={di % 2 === 0 ? '' : 'bg-slate-50/40'}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{d.name}</td>
                  {weekOptions.map(w => {
                    const row = teamActuals.find(r => r.department === 'design' && r.week_of === w && r.member_name === d.name);
                    if (!row || (row.actual_hours === 0 && row.actual_orders === 0)) {
                      return <td key={w} className="px-3 py-2 text-center text-slate-200">—</td>;
                    }
                    const r = row.actual_hours > 0 && row.actual_orders > 0 ? row.actual_hours / row.actual_orders : null;
                    return (
                      <td key={w} className="px-3 py-2 text-center">
                        <div className="font-medium text-indigo-700">{row.actual_orders}f</div>
                        <div className="text-slate-400">{row.actual_hours}h</div>
                        {r !== null && <div className={r <= 1.5 ? 'text-green-700' : r <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{r.toFixed(2)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly actuals summary */}
      {Object.keys(monthlyByDesigner).length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Monthly actuals summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500">Designer</th>
                  {Object.keys(monthlyByDesigner).sort().map(m => (
                    <th key={m} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[110px]">{m.split(' ')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {designers.map((d, di) => (
                  <tr key={d.id} className={di % 2 === 0 ? '' : 'bg-slate-50/40'}>
                    <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{d.name}</td>
                    {Object.keys(monthlyByDesigner).sort().map(m => {
                      const s = monthlyByDesigner[m]?.[d.id];
                      if (!s || s.frames === 0) return <td key={m} className="px-3 py-2 text-center text-slate-200">—</td>;
                      const r = s.hours > 0 && s.frames > 0 ? s.hours / s.frames : null;
                      const cpo = s.cost > 0 && s.frames > 0 ? s.cost / s.frames : null;
                      return (
                        <td key={m} className="px-3 py-2 text-center">
                          <div className="font-medium text-indigo-700">{s.frames}f</div>
                          <div className="text-slate-400">{s.hours}h</div>
                          {r !== null && <div className={r <= 1.5 ? 'text-green-700' : r <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{r.toFixed(2)}</div>}
                          {hasCost && cpo !== null && <div className="text-amber-600">{fmt$(cpo)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Preservation team data ────────────────────────────────────────────────────

const UTAH_PRESERVATION_TEAM = [
  { id: 'ut-p1', name: 'Katelyn Wilson', ratio: 0.7, pay: 'hourly' as const, rate: 0, hours: Array(5).fill(8) },
  { id: 'ut-p2', name: 'Emma Dunakey',   ratio: 0.5, pay: 'hourly' as const, rate: 0, hours: Array(5).fill(8) },
  { id: 'ut-p3', name: 'Flex',           ratio: 1.0, pay: 'flex'   as const, rate: 0, hours: Array(5).fill(0) },
  { id: 'ut-p4', name: 'On Call',        ratio: 1.0, pay: 'oncall' as const, rate: 0, hours: Array(5).fill(0) },
];

const GEORGIA_PRESERVATION_TEAM = [
  { id: 'ga-p1', name: 'Amber Garrett', ratio: 0.42, pay: 'hourly' as const, rate: 0, hours: Array(5).fill(8) },
  { id: 'ga-p2', name: 'Celt Stewart',  ratio: 0.5,  pay: 'hourly' as const, rate: 0, hours: Array(5).fill(8) },
  { id: 'ga-p3', name: 'Flex',          ratio: 1.0,  pay: 'flex'   as const, rate: 0, hours: Array(5).fill(0) },
  { id: 'ga-p4', name: 'On Call',       ratio: 1.0,  pay: 'oncall' as const, rate: 0, hours: Array(5).fill(0) },
];

const UTAH_FULFILLMENT_TEAM = [
  { id: 'ut-f1', name: 'Izabella DePrima',       ratio: 1.0,  pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
  { id: 'ut-f2', name: 'Warner Neuenschwander',  ratio: 0.5,  pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
  { id: 'ut-f3', name: 'Owen Shaw',              ratio: 0.35, pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
  { id: 'ut-f4', name: 'Emma Swenson',           ratio: 0.37, pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
];

const GEORGIA_FULFILLMENT_TEAM = [
  { id: 'ga-f1', name: 'Yann Jean-Louis', ratio: 2.0,  pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
  { id: 'ga-f2', name: 'Nahid Knight',    ratio: 0.75, pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
  { id: 'ga-f3', name: 'Shantel Phifer',  ratio: 0.61, pay: 'hourly' as const, rate: 0, hours: Array(8).fill(8) },
];

type PresTeamMember = { id: string; name: string; ratio: number; pay: 'hourly'|'flex'|'oncall'; rate: number; hours: number[] };
type FfTeamMember   = { id: string; name: string; ratio: number; pay: 'hourly'; rate: number; hours: number[] };

// Dynamic week labels — always real Monday dates
function getWeekLabels8(): string[] {
  return Array.from({ length: 8 }, (_, i) =>
    getMondayDate(i).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
}

function parseDateRange(from: string, to: string): Record<string, number> {
  // Returns mock event-date counts for the range — in production this would
  // call /api/event-dates?from=X&to=Y which pulls from EventDateSection data
  const MOCK: Record<string, number> = {
    '2026-04-07':3,'2026-04-08':10,'2026-04-09':1,'2026-04-10':6,
    '2026-04-11':33,'2026-04-12':5,'2026-04-13':1,'2026-04-14':4,
    '2026-04-15':8,'2026-04-16':12,'2026-04-17':7,'2026-04-18':22,
    '2026-04-19':18,'2026-04-20':3,'2026-04-21':9,'2026-04-22':15,
    '2026-04-23':11,'2026-04-24':6,'2026-04-25':14,'2026-04-26':20,
    '2026-04-27':17,'2026-04-28':5,'2026-04-29':8,'2026-04-30':13,
  };
  const result: Record<string, number> = {};
  let d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (d <= end) {
    const iso = d.toISOString().split('T')[0];
    if (MOCK[iso]) result[iso] = MOCK[iso];
    d.setDate(d.getDate() + 1);
  }
  return result;
}

// ─── DeptHistoricalsTab ────────────────────────────────────────────────────────
// Shared historicals tab used by Preservation and Fulfillment

function DeptHistoricalsTab({ department, location, teamMembers, teamActuals, onActualsSaved, showReceivedField, ordersLabel, onPresActualsSaved }: {
  department:          'preservation' | 'fulfillment';
  location:            'Utah' | 'Georgia';
  teamMembers:         string[];
  teamActuals:         { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:      () => void;
  showReceivedField:   boolean;  // preservation only — shows total bouquets received field
  ordersLabel:         string;   // e.g. "bouquets preserved" or "orders sealed"
  onPresActualsSaved?: (weekOf: string, received: number) => void;
}) {
  const HIST_WEEKS  = 12;
  const weekOptions = pastWeeks(HIST_WEEKS);
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[0]);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [localEdits,   setLocalEdits]   = useState<Record<string, { hours: number; orders: number }>>({});
  const [totalReceived, setTotalReceived] = useState(0);

  // Load existing actuals into totalReceived when week changes
  useEffect(() => {
    if (!showReceivedField) return;
    // Look for a preservation week actual for this week from presActuals
    setTotalReceived(0); // will be overridden by parent presActuals if available
    setLocalEdits({});
  }, [selectedWeek, showReceivedField]);

  function getEntry(name: string) {
    if (localEdits[name]) return localEdits[name];
    const row = teamActuals.find(r => r.department === department && r.week_of === selectedWeek && r.member_name === name);
    return { hours: row?.actual_hours ?? 0, orders: row?.actual_orders ?? 0 };
  }

  function setEntry(name: string, field: 'hours' | 'orders', val: number) {
    setLocalEdits(prev => ({ ...prev, [name]: { ...getEntry(name), [field]: val } }));
  }

  async function saveWeek() {
    setSaving(true); setSaveMsg('');
    try {
      const saves: Promise<unknown>[] = teamMembers.map(name => {
        const entry = getEntry(name);
        if (entry.hours === 0 && entry.orders === 0) return Promise.resolve();
        return fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'team', location, weekOf: selectedWeek, department, memberName: name, actualHours: entry.hours, actualOrders: entry.orders }),
        });
      });
      if (showReceivedField && totalReceived > 0) {
        saves.push(fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'preservation', location, weekOf: selectedWeek, received: totalReceived }),
        }));
        onPresActualsSaved?.(selectedWeek, totalReceived);
      }
      await Promise.all(saves);
      setLocalEdits({});
      setSaveMsg('Saved');
      onActualsSaved();
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Save failed'); }
    setSaving(false);
  }

  const weekData = teamMembers.map(name => {
    const entry = getEntry(name);
    const ratio = entry.hours > 0 && entry.orders > 0 ? entry.hours / entry.orders : null;
    return { name, hours: entry.hours, orders: entry.orders, ratio };
  });

  const teamOrders = weekData.reduce((s, r) => s + r.orders, 0);
  const teamHours  = weekData.reduce((s, r) => s + r.hours, 0);
  const teamRatio  = teamOrders > 0 && teamHours > 0 ? teamHours / teamOrders : null;

  // Monthly summary
  const monthlyByMember = useMemo(() => {
    const map: Record<string, Record<string, { orders: number; hours: number }>> = {};
    teamActuals.filter(r => r.department === department).forEach(r => {
      const monthKey = new Date(r.week_of + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!map[monthKey]) map[monthKey] = {};
      if (!map[monthKey][r.member_name]) map[monthKey][r.member_name] = { orders: 0, hours: 0 };
      map[monthKey][r.member_name].orders += r.actual_orders;
      map[monthKey][r.member_name].hours  += r.actual_hours;
    });
    return map;
  }, [teamActuals, department]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-slate-500">Week of</label>
        <select value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setLocalEdits({}); }}
          className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
          {weekOptions.map(w => <option key={w} value={w}>{fmtDate(w)} – {fmtDate(addDays(w, 6))}</option>)}
        </select>
        <button onClick={() => void saveWeek()} disabled={saving}
          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save week actuals'}
        </button>
        {saveMsg && <span className={`text-xs ${saveMsg === 'Saved' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</span>}
      </div>

      {/* Total received field — preservation only */}
      {showReceivedField && (
        <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total bouquets received this week</p>
            <p className="text-xs text-slate-400">This feeds the &quot;Received&quot; column in Queue &amp; Turnaround for the FIFO simulation.</p>
          </div>
          <input type="number" value={totalReceived || ''} placeholder="0" min="0"
            onChange={e => setTotalReceived(parseInt(e.target.value) || 0)}
            className="w-24 border border-green-300 rounded px-2 py-1.5 text-xl font-semibold text-green-700 text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-400" />
        </div>
      )}

      {/* Per-member table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Week of {fmtDate(selectedWeek)}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Enter actual {ordersLabel} and hours worked. Saved to shared database.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2 text-left font-medium text-slate-500">Team member</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual {ordersLabel}</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual hours</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500">Actual ratio (h/ord)</th>
              </tr>
            </thead>
            <tbody>
              {weekData.map((row, i) => (
                <tr key={row.name} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2 font-medium text-slate-700">{row.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={row.orders || ''} min="0" placeholder="0"
                      onChange={e => setEntry(row.name, 'orders', parseInt(e.target.value) || 0)}
                      className="w-16 border border-slate-200 rounded px-2 py-1 text-center text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={row.hours || ''} min="0" step="0.5" placeholder="0"
                      onChange={e => setEntry(row.name, 'hours', parseFloat(e.target.value) || 0)}
                      className="w-16 border border-slate-200 rounded px-2 py-1 text-center text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.ratio !== null ? (
                      <span className={`font-semibold ${row.ratio <= 1.4 ? 'text-green-700' : row.ratio <= 1.8 ? 'text-amber-700' : 'text-red-700'}`}>
                        {row.ratio.toFixed(2)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-indigo-50/30 font-semibold">
                <td className="px-4 py-2 text-slate-700">Team total</td>
                <td className="px-3 py-2 text-center text-indigo-700">{teamOrders || '—'}</td>
                <td className="px-3 py-2 text-center text-slate-700">{teamHours || '—'}</td>
                <td className="px-3 py-2 text-center">
                  {teamRatio !== null ? <span className={teamRatio <= 1.5 ? 'text-green-700' : teamRatio <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{teamRatio.toFixed(2)}</span> : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* All-weeks overview */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">All weeks overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500">Team member</th>
                {weekOptions.map(w => (
                  <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[100px]">{fmtDate(w).split(',')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((name, ni) => (
                <tr key={name} className={ni % 2 === 0 ? '' : 'bg-slate-50/40'}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{name}</td>
                  {weekOptions.map(w => {
                    const row = teamActuals.find(r => r.department === department && r.week_of === w && r.member_name === name);
                    if (!row || (row.actual_hours === 0 && row.actual_orders === 0)) return <td key={w} className="px-3 py-2 text-center text-slate-200">—</td>;
                    const r = row.actual_hours > 0 && row.actual_orders > 0 ? row.actual_hours / row.actual_orders : null;
                    return (
                      <td key={w} className="px-3 py-2 text-center">
                        <div className="font-medium text-indigo-700">{row.actual_orders}</div>
                        <div className="text-slate-400">{row.actual_hours}h</div>
                        {r !== null && <div className={r <= 1.5 ? 'text-green-700' : r <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{r.toFixed(2)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly summary */}
      {Object.keys(monthlyByMember).length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Monthly actuals summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500">Team member</th>
                  {Object.keys(monthlyByMember).sort().map(m => (
                    <th key={m} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[110px]">{m.split(' ')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((name, ni) => (
                  <tr key={name} className={ni % 2 === 0 ? '' : 'bg-slate-50/40'}>
                    <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{name}</td>
                    {Object.keys(monthlyByMember).sort().map(m => {
                      const s = monthlyByMember[m]?.[name];
                      if (!s || s.orders === 0) return <td key={m} className="px-3 py-2 text-center text-slate-200">—</td>;
                      const r = s.hours > 0 && s.orders > 0 ? s.hours / s.orders : null;
                      return (
                        <td key={m} className="px-3 py-2 text-center">
                          <div className="font-medium text-indigo-700">{s.orders}</div>
                          <div className="text-slate-400">{s.hours}h</div>
                          {r !== null && <div className={r <= 1.5 ? 'text-green-700' : r <= 1.8 ? 'text-amber-700' : 'text-red-700'}>{r.toFixed(2)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PreservationSection ───────────────────────────────────────────────────────

function PreservationSection({ location, preservationQueue, countsLoading, teamActuals, onActualsSaved,
  presHours, presRoster, presSettings, onPresHoursChange, onPresRosterChange, onPresSettingsChange }: {
  location:              'Utah' | 'Georgia';
  preservationQueue:     number;
  countsLoading:         boolean;
  teamActuals:           { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:        () => void;
  presHours:             Record<string, number[]>;
  presRoster:            Record<string, { ratio: number; rate: number; name: string }>;
  presSettings:          { dayPcts: number[]; utPct: number; gaPct: number; unkPct: number; dateFrom?: string; dateTo?: string };
  onPresHoursChange:     (h: Record<string, number[]>) => void;
  onPresRosterChange:    (r: Record<string, { ratio: number; rate: number; name: string }>) => void;
  onPresSettingsChange:  (s: { dayPcts: number[]; utPct: number; gaPct: number; unkPct: number; dateFrom?: string; dateTo?: string }) => void;
}) {
  const today    = new Date();
  const monday   = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  const mondayIso = monday.toISOString().split('T')[0];
  const sundayIso = addDays(mondayIso, 6);

  const [presTab,     setPresTab]     = useState<'schedule' | 'historicals'>('schedule');
  const [showRoster,  setShowRoster]  = useState(false);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>(() => parseDateRange(mondayIso, sundayIso));
  const [eventTotal,  setEventTotal]  = useState(() => Object.values(parseDateRange(mondayIso, sundayIso)).reduce((a,b)=>a+b,0));

  // Use persisted settings
  const dayPcts  = presSettings.dayPcts ?? [20,25,25,20,10];
  const utPct    = presSettings.utPct   ?? 50;
  const gaPct    = presSettings.gaPct   ?? 40;
  const unkPct   = presSettings.unkPct  ?? 10;
  const dateFrom = presSettings.dateFrom ?? mondayIso;
  const dateTo   = presSettings.dateTo   ?? sundayIso;

  function setDateFrom(v: string) { onPresSettingsChange({ ...presSettings, dateFrom: v }); }
  function setDateTo(v: string)   { onPresSettingsChange({ ...presSettings, dateTo: v }); }
  function setDayPcts(fn: (prev: number[]) => number[]) {
    onPresSettingsChange({ ...presSettings, dayPcts: fn(dayPcts) });
  }
  function setUtPct(v: number)  { onPresSettingsChange({ ...presSettings, utPct: v }); }
  function setGaPct(v: number)  { onPresSettingsChange({ ...presSettings, gaPct: v }); }
  function setUnkPct(v: number) { onPresSettingsChange({ ...presSettings, unkPct: v }); }

  // Merge persisted roster + hours over defaults
  const defaultTeam = location === 'Utah' ? UTAH_PRESERVATION_TEAM : GEORGIA_PRESERVATION_TEAM;
  const team: PresTeamMember[] = defaultTeam.map((m, mi) => {
    const roster = presRoster[m.id];
    const hours  = presHours[m.id] ?? Array(5).fill(m.hours[0] ?? 0);
    return { ...m, ratio: roster?.ratio ?? m.ratio, rate: roster?.rate ?? m.rate, hours };
  });

  function loadRange(from: string, to: string) {
    const counts = parseDateRange(from, to);
    setEventCounts(counts);
    setEventTotal(Object.values(counts).reduce((a, b) => a + b, 0));
  }

  function setQuick(mode: string) {
    const d = new Date(); const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    let from: Date, to: Date;
    if (mode === 'thisweek')      { from = mon; to = new Date(mon); to.setDate(mon.getDate() + 6); }
    else if (mode === 'nextweek') { from = new Date(mon); from.setDate(mon.getDate() + 7); to = new Date(from); to.setDate(from.getDate() + 6); }
    else if (mode === 'next2')    { from = new Date(mon); from.setDate(mon.getDate() + 7); to = new Date(from); to.setDate(from.getDate() + 13); }
    else { from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    const f = from.toISOString().split('T')[0]; const t = to.toISOString().split('T')[0];
    setDateFrom(f); setDateTo(t); loadRange(f, t);
  }

  const locPct   = location === 'Utah' ? utPct : gaPct;
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  // Build next 5 weekdays (Mon-Fri only)
  const fiveDays = (() => {
    const days = [];
    const d = new Date();
    while (days.length < 5) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        const iso = d.toISOString().split('T')[0];
        const dayIdx = dow - 1; // Mon=0..Fri=4
        const est = Math.round(eventTotal * (locPct / 100) * ((dayPcts[dayIdx] ?? 0) / 100));
        days.push({ iso, est, label: d.toLocaleDateString('en-US', { weekday: 'short' }), dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
      }
      d.setDate(d.getDate() + 1);
    }
    return days;
  })();
  const sevenDays = fiveDays; // alias kept for JSX compatibility

  function updateHours(mi: number, di: number, val: number) {
    const id = defaultTeam[mi].id;
    const newHours = { ...presHours, [id]: team[mi].hours.map((h, j) => j === di ? val : h) };
    onPresHoursChange(newHours);
  }
  function updateRoster(mi: number, field: 'ratio' | 'rate', val: number) {
    const id = defaultTeam[mi].id;
    const existing = presRoster[id] ?? { ratio: team[mi].ratio, rate: team[mi].rate, name: team[mi].name };
    onPresRosterChange({ ...presRoster, [id]: { ...existing, [field]: val } });
  }

  const dayTotals = Array.from({ length: 5 }, (_, di) =>
    team.reduce((s, m) => s + (m.ratio > 0 ? Math.round((m.hours[di] ?? 0) / m.ratio) : 0), 0)
  );

  const hasRates = team.some(m => m.rate > 0);

  const tagStyle: Record<string, string> = {
    hourly: 'bg-slate-100 text-slate-600',
    flex:   'bg-indigo-100 text-indigo-700',
    oncall: 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="space-y-4">
      {/* Date range picker */}
      <div className="bg-white border border-slate-100 rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-medium text-slate-500">Event date range</span>
          {(['thisweek','nextweek','next2','thismonth'] as const).map((m, i) => (
            <button key={m} onClick={() => setQuick(m)}
              className="text-xs px-3 py-1 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 transition-colors">
              {['This week','Next week','Next 2 wks','This month'][i]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <button onClick={() => loadRange(dateFrom, dateTo)}
            className="px-4 py-1.5 text-xs font-medium bg-rose-700 text-white rounded hover:bg-rose-800 transition-colors">Load</button>
          {eventTotal > 0 && <span className="text-sm font-medium text-rose-700">{eventTotal} total orders</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Arrival % by day of week</h3>
          <p className="text-xs text-slate-400 mb-3">% of weekly orders arriving each day. Should total 100%.</p>
          <div className="space-y-2">
            {dayNames.map((d, i) => (
              <div key={d} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">{d}</span>
                <input type="number" value={dayPcts[i]} min="0" max="100"
                  onChange={e => setDayPcts(prev => prev.map((v, j) => j === i ? parseFloat(e.target.value) || 0 : v))}
                  className="w-14 border border-slate-200 rounded px-2 py-1 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                <span className="text-xs text-slate-400">%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-400">Total:</span>
            <span className={`text-xs font-semibold ${dayPcts.reduce((a,b)=>a+b,0) === 100 ? 'text-green-700' : 'text-red-600'}`}>{dayPcts.reduce((a,b)=>a+b,0)}%</span>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Location split</h3>
          <p className="text-xs text-slate-400 mb-3">% of deliveries going to each location.</p>
          <div className="space-y-2">
            {([['Utah', utPct, setUtPct], ['Georgia', gaPct, setGaPct], ['Unknown', unkPct, setUnkPct]] as [string, number, (v: number) => void][]).map(([label, val, setter]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-16">{label}</span>
                <input type="number" value={val} min="0" max="100"
                  onChange={e => setter(parseFloat(e.target.value) || 0)}
                  className="w-14 border border-slate-200 rounded px-2 py-1 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                <span className="text-xs text-slate-400">%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-400">Total:</span>
            <span className={`text-xs font-semibold ${utPct + gaPct + unkPct === 100 ? 'text-green-700' : 'text-red-600'}`}>{utPct + gaPct + unkPct}%</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2">Based on {eventTotal} total orders in range</p>
            <div className="flex gap-6">
              <div><p className="text-xs text-slate-400">Utah est.</p><p className="text-xl font-semibold text-indigo-700">{Math.round(eventTotal * utPct / 100)}</p></div>
              <div><p className="text-xs text-slate-400">Georgia est.</p><p className="text-xl font-semibold text-indigo-700">{Math.round(eventTotal * gaPct / 100)}</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* 7-day grid */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
          Estimated deliveries — next 7 days ({location} · {locPct}%)
        </p>
        <div className="grid grid-cols-5 gap-2">
          {sevenDays.map((d, i) => (
            <div key={i} className={`bg-white border border-slate-100 rounded-lg p-2 text-center`}>
              <p className="text-[10px] text-slate-400">{d.dateStr}</p>
              <p className={`text-xs font-medium mb-1 text-slate-600`}>{d.label}</p>
              <p className={`text-xl font-semibold ${d.est === 0 ? 'text-slate-300' : 'text-green-700'}`}>{d.est}</p>
              <p className="text-[10px] text-slate-400">est.</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs: Schedule | Historicals */}
      <div className="flex border-b border-slate-200">
        {(['schedule', 'historicals'] as const).map(t => (
          <button key={t} onClick={() => setPresTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              presTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>{t === 'schedule' ? 'Weekly Schedule' : 'Historicals'}</button>
        ))}
      </div>

      {/* ── SCHEDULE TAB ── */}
      {presTab === 'schedule' && (
        <>
          {/* Roster editor */}
          <div>
            <button onClick={() => setShowRoster(r => !r)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              {showRoster ? '▲ Hide' : '▼ Edit'} preservation roster, ratios &amp; pay rates
            </button>
            {showRoster && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-5">
                <div className="grid grid-cols-[1fr_80px_80px_110px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
                  <span>Name</span><span className="text-center">Pay type</span><span className="text-center">Ratio</span><span className="text-center">Hourly rate</span><span />
                </div>
                <div className="space-y-2">
                  {team.map((m, mi) => (
                    <div key={m.id} className="grid grid-cols-[1fr_80px_80px_110px_20px] gap-2 items-center">
                      <div className="text-sm text-slate-700 px-2 py-1.5">
                        {m.name}
                        <span className={`ml-1.5 text-[10px] rounded px-1 py-px ${tagStyle[m.pay]}`}>{m.pay}</span>
                      </div>
                      <div className="text-xs text-center text-slate-500 px-1">{m.pay}</div>
                      <input type="number" value={m.ratio} step="0.01" min="0.01"
                        onChange={e => updateRoster(mi, 'ratio', parseFloat(e.target.value) || 0)}
                        className="border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
                        <input type="number" value={m.rate || ''} step="0.50" min="0" placeholder="0"
                          onChange={e => updateRoster(mi, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      </div>
                      <div />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400"><strong>Ratio:</strong> hours per order (same as design). e.g. 0.7 = 1 order takes 0.7 hrs.</p>
              </div>
            )}
          </div>

          {/* Schedule table */}
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Hours per team member per day</h3>
              {hasRates && <span className="text-xs text-slate-400">CPO shown when rate is set</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 min-w-[140px]">Team member</th>
                    {sevenDays.map((d, i) => (
                      <th key={i} className={`px-2 py-2 text-center font-medium min-w-[72px] whitespace-nowrap ${i === 0 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}>
                        {d.label}<br /><span className="font-normal text-[10px]">{d.dateStr}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map((m, mi) => (
                    <tr key={m.id} className={mi % 2 === 0 ? '' : 'bg-slate-50/40'}>
                      <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{m.name}</div>
                        <div className="text-slate-400">{m.ratio} h/ord
                          <span className={`ml-1.5 text-[10px] rounded px-1 py-px ${tagStyle[m.pay]}`}>{m.pay}</span>
                        </div>
                      </td>
                      {sevenDays.map((_, di) => {
                        const h = m.hours[di] ?? 0;
                        const orders = m.ratio > 0 ? Math.round(h / m.ratio) : 0;
                        const cost = h * m.rate;
                        const cpo = orders > 0 && cost > 0 ? cost / orders : null;
                        return (
                          <td key={di} className={`px-2 py-1.5 text-center ${di === 0 ? 'bg-indigo-50/30' : ''}`}>
                            <input type="number" value={h || ''} placeholder="0" min="0" step="0.5"
                              onChange={e => updateHours(mi, di, parseFloat(e.target.value) || 0)}
                              className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            {orders > 0 && <div className="text-slate-400 mt-0.5">{orders} ord</div>}
                            {cpo !== null && <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Capacity row */}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Daily capacity</td>
                    {sevenDays.map((d, di) => {
                      const cap = dayTotals[di];
                      const diff = cap - d.est;
                      const allCost = team.reduce((s, m) => s + (m.hours[di] ?? 0) * m.rate, 0);
                      const dayCPO = cap > 0 && allCost > 0 ? allCost / cap : null;
                      return (
                        <td key={di} className={`px-2 py-2 text-center ${di === 0 ? 'bg-indigo-50/50' : ''}`}>
                          <div className="text-indigo-700">{cap} ord</div>
                          {d.est > 0 && (
                            <div className={`text-[10px] font-medium ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                              {diff > 0 ? '+' : ''}{diff} vs est.
                            </div>
                          )}
                          {dayCPO !== null && <div className="text-[10px] text-amber-600">{fmt$(dayCPO)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Est deliveries row */}
                  <tr className="bg-slate-50/50">
                    <td className="sticky left-0 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">Est. deliveries</td>
                    {sevenDays.map((d, di) => (
                      <td key={di} className="px-2 py-1.5 text-center text-[10px] text-slate-400">{d.est || '—'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── HISTORICALS TAB ── */}
      {presTab === 'historicals' && (
        <DeptHistoricalsTab
          department="preservation"
          location={location}
          teamMembers={team.map(m => m.name)}
          teamActuals={teamActuals}
          onActualsSaved={onActualsSaved}
          showReceivedField={true}
          ordersLabel="bouquets preserved"
        />
      )}
    </div>
  );
}

// ─── FulfillmentSection ────────────────────────────────────────────────────────

function FulfillmentSection({ location, fulfillmentQueue, countsLoading, teamActuals, onActualsSaved,
  ffHours, ffRoster, onFfHoursChange, onFfRosterChange }: {
  location:        'Utah' | 'Georgia';
  fulfillmentQueue: number;
  countsLoading:   boolean;
  teamActuals:     { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:  () => void;
  ffHours:         Record<string, number[]>;
  ffRoster:        Record<string, { ratio: number; rate: number; name: string }>;
  onFfHoursChange: (h: Record<string, number[]>) => void;
  onFfRosterChange:(r: Record<string, { ratio: number; rate: number; name: string }>) => void;
}) {
  const [ffTab,      setFfTab]      = useState<'schedule' | 'historicals'>('schedule');
  const [showRoster, setShowRoster] = useState(false);

  // Merge persisted roster + hours over defaults
  const defaultTeam = location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM;
  const team: FfTeamMember[] = defaultTeam.map((m) => {
    const roster = ffRoster[m.id];
    const hours  = ffHours[m.id] ?? [...m.hours];
    return { ...m, ratio: roster?.ratio ?? m.ratio, rate: roster?.rate ?? m.rate, hours };
  });

  function updateHours(mi: number, wi: number, val: number) {
    const id = defaultTeam[mi].id;
    const newHours = { ...ffHours, [id]: team[mi].hours.map((h, j) => j === wi ? val : h) };
    onFfHoursChange(newHours);
  }
  function updateRoster(mi: number, field: 'ratio' | 'rate', val: number) {
    const id = defaultTeam[mi].id;
    const existing = ffRoster[id] ?? { ratio: team[mi].ratio, rate: team[mi].rate, name: team[mi].name };
    onFfRosterChange({ ...ffRoster, [id]: { ...existing, [field]: val } });
  }

  const weekCap    = team.reduce((s, m) => s + (m.ratio > 0 ? Math.round((m.hours[0] ?? 0) / m.ratio) : 0), 0);
  const weekCost   = team.reduce((s, m) => s + (m.hours[0] ?? 0) * m.rate, 0);
  const teamCPO    = weekCap > 0 && weekCost > 0 ? weekCost / weekCap : null;
  const weeksToClr = weekCap > 0 ? Math.ceil(fulfillmentQueue / weekCap) : null;
  const hasRates   = team.some(m => m.rate > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Fulfillment queue</p>
          <p className="text-xs text-slate-400 mb-2">Approved + Glued</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-amber-700">{countsLoading ? '\u2026' : fulfillmentQueue.toLocaleString()}</p>
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">live</span>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">This week capacity</p>
          <p className="text-xs text-slate-400 mb-2">&nbsp;</p>
          <p className="text-xl font-semibold text-slate-900">{weekCap} <span className="text-sm font-normal text-slate-400">orders</span></p>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Team CPO</p>
          <p className="text-xs text-slate-400 mb-2">weighted avg this week</p>
          <p className="text-xl font-semibold text-slate-900">{teamCPO !== null ? fmt$(teamCPO) : '\u2014'}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Weeks to clear queue</p>
          <p className="text-xs text-slate-400 mb-2">at current pace</p>
          <p className="text-xl font-semibold text-slate-900">{weeksToClr !== null ? `${weeksToClr}w` : '\u2014'}</p>
        </div>
      </div>

      <div className="flex border-b border-slate-200">
        {(['schedule', 'historicals'] as const).map(t => (
          <button key={t} onClick={() => setFfTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              ffTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>{t === 'schedule' ? 'Weekly Schedule' : 'Historicals'}</button>
        ))}
      </div>

      {ffTab === 'schedule' && (
        <>
          <div>
            <button onClick={() => setShowRoster(r => !r)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              {showRoster ? '\u25b2 Hide' : '\u25bc Edit'} fulfillment roster, ratios &amp; pay rates
            </button>
            {showRoster && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-5">
                <div className="grid grid-cols-[1fr_80px_110px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
                  <span>Name</span><span className="text-center">Ratio</span><span className="text-center">Hourly rate</span><span />
                </div>
                <div className="space-y-2">
                  {team.map((m, mi) => (
                    <div key={m.id} className="grid grid-cols-[1fr_80px_110px_20px] gap-2 items-center">
                      <div className="text-sm text-slate-700 px-2 py-1.5">{m.name}</div>
                      <input type="number" value={m.ratio} step="0.01" min="0.01"
                        onChange={e => updateRoster(mi, 'ratio', parseFloat(e.target.value) || 0)}
                        className="border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
                        <input type="number" value={m.rate || ''} step="0.50" min="0" placeholder="0"
                          onChange={e => updateRoster(mi, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      </div>
                      <div />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400"><strong>Ratio:</strong> hours per order. e.g. 0.5 = 1 order per 0.5 hrs.</p>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Hours per team member per week</h3>
              {hasRates && <span className="text-xs text-slate-400">CPO shown when rate is set</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 min-w-[160px]">Team member</th>
                    {getWeekLabels8().map((w, i) => (
                      <th key={i} className={`px-2 py-2 text-center font-medium min-w-[80px] ${i === 0 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}>
                        {w}{i === 0 && <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-600 rounded px-1">now</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map((m, mi) => (
                    <tr key={m.id} className={mi % 2 === 0 ? '' : 'bg-slate-50/40'}>
                      <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{m.name}</div>
                        <div className="text-slate-400">{m.ratio} h/ord</div>
                      </td>
                      {getWeekLabels8().map((_, wi) => {
                        const h = m.hours[wi] ?? 0;
                        const o = m.ratio > 0 ? Math.round(h / m.ratio) : 0;
                        const cost = h * m.rate;
                        const cpo = o > 0 && cost > 0 ? cost / o : null;
                        return (
                          <td key={wi} className={`px-2 py-1.5 text-center ${wi === 0 ? 'bg-indigo-50/30' : ''}`}>
                            <input type="number" value={h || ''} placeholder="0" min="0" step="0.5"
                              onChange={e => updateHours(mi, wi, parseFloat(e.target.value) || 0)}
                              className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            {o > 0 && <div className="text-slate-400 mt-0.5">{o} ord</div>}
                            {cpo !== null && <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Week total</td>
                    {getWeekLabels8().map((_, wi) => {
                      const c = team.reduce((s, m) => s + (m.ratio > 0 ? Math.round((m.hours[wi] ?? 0) / m.ratio) : 0), 0);
                      const cost = team.reduce((s, m) => s + (m.hours[wi] ?? 0) * m.rate, 0);
                      const cpo = c > 0 && cost > 0 ? cost / c : null;
                      return (
                        <td key={wi} className={`px-2 py-2 text-center ${wi === 0 ? 'bg-indigo-50/50' : ''}`}>
                          <div className="text-amber-700">{c} ord</div>
                          {cpo !== null && <div className="text-[10px] text-amber-600">{fmt$(cpo)}/ord</div>}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {ffTab === 'historicals' && (
        <DeptHistoricalsTab
          department="fulfillment"
          location={location}
          teamMembers={team.map(m => m.name)}
          teamActuals={teamActuals}
          onActualsSaved={onActualsSaved}
          showReceivedField={false}
          ordersLabel="orders sealed"
        />
      )}
    </div>
  );
}

// ─── Master roster data ───────────────────────────────────────────────────────
// All real staff per location with home dept and whether they are on-call only

interface StaffMember {
  id:       string;
  name:     string;
  homeDept: 'design' | 'preservation' | 'fulfillment';
  onCall:   boolean;
}

const UTAH_STAFF: StaffMember[] = [
  { id: 'ut-mgr', name: 'Jennika Merrill',       homeDept: 'design',       onCall: false },
  { id: 'ut-1',   name: 'Deanna L Brown',         homeDept: 'design',       onCall: false },
  { id: 'ut-2',   name: 'Sarah Glissmeyer',        homeDept: 'design',       onCall: false },
  { id: 'ut-3',   name: 'Kathryn Hill',            homeDept: 'design',       onCall: false },
  { id: 'ut-4',   name: 'Mia Legas',               homeDept: 'design',       onCall: false },
  { id: 'ut-5',   name: 'Sloane James',            homeDept: 'design',       onCall: false },
  { id: 'ut-6',   name: 'Audrey Brown',            homeDept: 'design',       onCall: false },
  { id: 'ut-7',   name: 'Chloe Leonard',           homeDept: 'design',       onCall: false },
  { id: 'ut-p1',  name: 'Katelyn Wilson',          homeDept: 'preservation', onCall: false },
  { id: 'ut-p2',  name: 'Emma Dunakey',            homeDept: 'preservation', onCall: true  },
  { id: 'ut-f1',  name: 'Izabella DePrima',        homeDept: 'fulfillment',  onCall: false },
  { id: 'ut-f2',  name: 'Warner Neuenschwander',   homeDept: 'fulfillment',  onCall: false },
  { id: 'ut-f3',  name: 'Owen Shaw',               homeDept: 'fulfillment',  onCall: false },
  { id: 'ut-f4',  name: 'Emma Swenson',            homeDept: 'fulfillment',  onCall: false },
];

const GEORGIA_STAFF: StaffMember[] = [
  { id: 'ga-1',  name: 'Katherine Piper',  homeDept: 'design',       onCall: false },
  { id: 'ga-2',  name: 'Allanna Harlan',   homeDept: 'design',       onCall: false },
  { id: 'ga-3',  name: 'Erin Webb',        homeDept: 'design',       onCall: false },
  { id: 'ga-4',  name: 'Rachel Tucker',    homeDept: 'design',       onCall: false },
  { id: 'ga-p1', name: 'Amber Garrett',    homeDept: 'preservation', onCall: false },
  { id: 'ga-p2', name: 'Celt Stewart',     homeDept: 'preservation', onCall: false },
  { id: 'ga-f1', name: 'Yann Jean-Louis',  homeDept: 'fulfillment',  onCall: false },
  { id: 'ga-f2', name: 'Nahid Knight',     homeDept: 'fulfillment',  onCall: false },
  { id: 'ga-f3', name: 'Shantel Phifer',   homeDept: 'fulfillment',  onCall: false },
];

const DEPT_COLOR: Record<string, string> = {
  design:       'bg-indigo-100 text-indigo-700',
  preservation: 'bg-green-100 text-green-700',
  fulfillment:  'bg-amber-100 text-amber-700',
};

// Returns next N weekdays (Mon-Fri) from today, optionally offset by weeks
function getWeekdays(weekOffset: number): { iso: string; label: string; dateStr: string }[] {
  const days: { iso: string; label: string; dateStr: string }[] = [];
  // Start from Monday of the offset week
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  monday.setHours(0,0,0,0);
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      iso:     d.toISOString().split('T')[0],
      label:   d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return days;
}

// ─── MasterScheduleSection ────────────────────────────────────────────────────

function MasterScheduleSection({ location, masterAvailability, onAvailabilityChange,
  designHours, designSchedule, presHours, ffHours, designRoster, presRoster, ffRoster }: {
  location:             'Utah' | 'Georgia';
  masterAvailability:   Record<string, { defaultHours: number; overrides: Record<string, number> }>;
  onAvailabilityChange: (a: Record<string, { defaultHours: number; overrides: Record<string, number> }>) => void;
  designHours:          Record<string, number[]>;
  designSchedule:       WeekSchedule[];
  presHours:            Record<string, number[]>;
  ffHours:              Record<string, number[]>;
  designRoster:         Record<string, { ratio: number; name: string }>;
  presRoster:           Record<string, { ratio: number; name: string }>;
  ffRoster:             Record<string, { ratio: number; name: string }>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const staff = location === 'Utah' ? UTAH_STAFF : GEORGIA_STAFF;
  const days   = getWeekdays(weekOffset);

  // Week index for design/ff (weekly schedules)
  const weekIdx = weekOffset;

  // ── Weekly totals per person ──────────────────────────────────────────────
  // designSchedule is already merged (persisted + defaults) — use it directly
  function getWeeklyScheduled(person: StaffMember): {
    design: number; preservation: number; fulfillment: number; total: number;
  } {
    // Design: read from the already-merged schedule array
    const dHrs = designSchedule[weekIdx]?.[person.id] ?? 0;
    // Preservation: sum of daily hours
    const pHrs = (presHours[person.id] ?? []).reduce((a, b) => a + b, 0);
    // Fulfillment: persisted weekly hours
    const fHrs = ffHours[person.id]?.[weekIdx] ?? 0;
    return { design: dHrs, preservation: pHrs, fulfillment: fHrs, total: dHrs + pHrs + fHrs };
  }

  // Weekly available = defaultHours × 5, overridable per week
  function getWeeklyAvail(person: StaffMember): number {
    const stored = masterAvailability[person.id];
    const mondayIso = days[0]?.iso ?? '';
    if (stored?.overrides?.[mondayIso] !== undefined) return stored.overrides[mondayIso];
    return (stored?.defaultHours ?? 8) * 5;
  }

  // Daily available for a specific day (used for preservation which is daily)
  function getDailyAvail(person: StaffMember, iso: string): number {
    const stored = masterAvailability[person.id];
    if (stored?.overrides?.[iso] !== undefined) return stored.overrides[iso];
    return stored?.defaultHours ?? 8;
  }

  function setDefault(personId: string, hours: number) {
    const existing = masterAvailability[personId] ?? { defaultHours: 8, overrides: {} };
    onAvailabilityChange({ ...masterAvailability, [personId]: { ...existing, defaultHours: hours } });
  }

  // Override for a specific day (pres team) or week Monday (design/ff)
  function setOverride(personId: string, iso: string, hours: number) {
    const existing = masterAvailability[personId] ?? { defaultHours: 8, overrides: {} };
    onAvailabilityChange({ ...masterAvailability, [personId]: { ...existing, overrides: { ...existing.overrides, [iso]: hours } } });
  }

  const weekLabel = weekOffset === 0 ? 'This week'
    : weekOffset === 1 ? 'Next week'
    : 'Week after next';

  // Group staff by dept
  const grouped = [
    { dept: 'design',       label: 'Design',      members: staff.filter(s => s.homeDept === 'design') },
    { dept: 'preservation', label: 'Preservation', members: staff.filter(s => s.homeDept === 'preservation') },
    { dept: 'fulfillment',  label: 'Fulfillment',  members: staff.filter(s => s.homeDept === 'fulfillment') },
  ] as const;

  const mondayIso = days[0]?.iso ?? '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{location} master schedule</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Weekly availability vs scheduled hours. Design &amp; fulfillment show weekly totals. Preservation shows daily.
            <span className="ml-2 text-red-500 font-medium">Red ⚠ = over-scheduled</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}
            className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">← Prev</button>
          <span className="text-xs font-medium text-slate-600 min-w-[100px] text-center">
            {weekLabel} · {days[0]?.dateStr} – {days[4]?.dateStr}
          </span>
          <button onClick={() => setWeekOffset(Math.min(2, weekOffset + 1))} disabled={weekOffset >= 2}
            className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">Next →</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {(['design','preservation','fulfillment'] as const).map(d => (
          <span key={d} className={`text-xs rounded px-2 py-0.5 ${DEPT_COLOR[d]}`}>{d.charAt(0).toUpperCase()+d.slice(1)}</span>
        ))}
        <span className="text-xs bg-slate-100 text-slate-500 rounded px-2 py-0.5">On call</span>
        <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">⚠ Over-scheduled</span>
      </div>

      {/* ── DESIGN + FULFILLMENT staff — weekly view ─────────────────────────── */}
      {(['design','fulfillment'] as const).map(deptKey => {
        const deptMembers = staff.filter(s => s.homeDept === deptKey);
        if (deptMembers.length === 0) return null;
        return (
          <div key={deptKey} className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className={`px-5 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide ${DEPT_COLOR[deptKey].split(' ')[1]}`}>
              {deptKey.charAt(0).toUpperCase()+deptKey.slice(1)} — weekly view ({days[0]?.dateStr} – {days[4]?.dateStr})
            </div>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2 text-left font-medium text-slate-500 min-w-[160px]">Team member</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500">Default<br/>hrs/day</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500">Available<br/>this week</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500 text-indigo-600">Design<br/>hrs</th>
                  <th className="px-3 py-2 text-center font-medium text-green-700">Pres<br/>hrs</th>
                  <th className="px-3 py-2 text-center font-medium text-amber-700">FF<br/>hrs</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500">Total<br/>scheduled</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500">Remaining<br/>for flex</th>
                </tr>
              </thead>
              <tbody>
                {deptMembers.map((person, pi) => {
                  const sched    = getWeeklyScheduled(person);
                  const avail    = getWeeklyAvail(person);
                  const remain   = avail - sched.total;
                  const over     = sched.total > avail && sched.total > 0;
                  const defaultH = masterAvailability[person.id]?.defaultHours ?? 8;
                  const weekOverride = masterAvailability[person.id]?.overrides?.[mondayIso];
                  return (
                    <tr key={person.id} className={`border-b border-slate-50 ${pi % 2 === 0 ? '' : 'bg-slate-50/30'} ${over ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{person.name}</div>
                        {person.onCall && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1 py-px">on call</span>}
                      </td>
                      {/* Default hours/day */}
                      <td className="px-3 py-2 text-center">
                        <input type="number" value={defaultH || ''} min="0" max="12" placeholder="8"
                          onChange={e => setDefault(person.id, parseFloat(e.target.value) || 0)}
                          className="w-12 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      </td>
                      {/* Available this week (default×5 or week override) */}
                      <td className="px-3 py-2 text-center">
                        <input type="number" value={weekOverride !== undefined ? weekOverride : avail} min="0" max="60" placeholder={String(defaultH * 5)}
                          onChange={e => setOverride(person.id, mondayIso, parseFloat(e.target.value) || 0)}
                          className={`w-14 border rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 ${weekOverride !== undefined ? 'border-indigo-300 text-indigo-700' : 'border-slate-200'}`}
                          title="Total available hours this week (click to override)" />
                      </td>
                      <td className="px-3 py-2 text-center font-medium text-indigo-700">{sched.design || '—'}</td>
                      <td className="px-3 py-2 text-center font-medium text-green-700">{sched.preservation || '—'}</td>
                      <td className="px-3 py-2 text-center font-medium text-amber-700">{sched.fulfillment || '—'}</td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-700">{sched.total || '—'}</td>
                      <td className={`px-3 py-2 text-center font-semibold ${over ? 'text-red-600' : remain > 0 ? 'text-green-700' : 'text-slate-400'}`}>
                        {over ? `⚠ ${Math.abs(remain)}h over` : remain > 0 ? `${remain}h free` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* ── PRESERVATION staff — daily view ──────────────────────────────────── */}
      {(() => {
        const presMembers = staff.filter(s => s.homeDept === 'preservation');
        if (presMembers.length === 0) return null;
        return (
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className="px-5 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-green-700">
              Preservation — daily view
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 min-w-[160px]">Team member</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-500">Default<br/>hrs/day</th>
                    {days.map(d => (
                      <th key={d.iso} className="px-2 py-2 text-center font-medium text-slate-500 min-w-[90px]">
                        <div>{d.label}</div>
                        <div className="font-normal text-[10px]">{d.dateStr}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium text-slate-500">Week<br/>remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {presMembers.map((person, pi) => {
                    const defaultH = masterAvailability[person.id]?.defaultHours ?? 8;
                    const weekSched = getWeeklyScheduled(person);
                    const weekAvail = defaultH * 5;
                    const weekRemain = weekAvail - weekSched.total;
                    const weekOver = weekSched.total > weekAvail && weekSched.total > 0;
                    return (
                      <tr key={person.id} className={`border-b border-slate-50 ${pi % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                        <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                          <div className="font-medium text-slate-700">{person.name}</div>
                          {person.onCall && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1 py-px">on call</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="number" value={defaultH || ''} min="0" max="12" placeholder="8"
                            onChange={e => setDefault(person.id, parseFloat(e.target.value) || 0)}
                            className="w-12 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        </td>
                        {days.map((d, di) => {
                          const avail   = getDailyAvail(person, d.iso);
                          const presHrs = presHours[person.id]?.[di] ?? 0;
                          const over    = presHrs > avail && presHrs > 0;
                          const remain  = avail - presHrs;
                          const isOverridden = masterAvailability[person.id]?.overrides?.[d.iso] !== undefined;
                          return (
                            <td key={d.iso} className={`px-2 py-1.5 text-center ${over ? 'bg-red-50' : ''}`}>
                              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                                <input type="number" value={avail || ''} min="0" max="12" placeholder={String(defaultH)}
                                  onChange={e => setOverride(person.id, d.iso, parseFloat(e.target.value) || 0)}
                                  className={`w-10 border rounded px-1 py-0.5 text-center text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 ${isOverridden ? 'border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
                                  title="Available hours this day" />
                                <span className="text-[10px] text-slate-300">av</span>
                              </div>
                              {presHrs > 0 && <div className="text-[10px] text-green-700 font-medium">{presHrs}h pres</div>}
                              {over ? (
                                <div className="text-[10px] text-red-600 font-semibold">⚠ +{presHrs - avail}h</div>
                              ) : remain > 0 ? (
                                <div className="text-[10px] text-slate-400">{remain}h free</div>
                              ) : null}
                            </td>
                          );
                        })}
                        {/* Week remaining summary */}
                        <td className={`px-3 py-2 text-center font-semibold ${weekOver ? 'text-red-600' : weekRemain > 0 ? 'text-green-700' : 'text-slate-400'}`}>
                          {weekOver ? `⚠ ${Math.abs(weekRemain)}h over` : weekRemain > 0 ? `${weekRemain}h free` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['design','preservation','fulfillment'] as const).map(d => {
          const deptStaff = staff.filter(s => s.homeDept === d && !s.onCall);
          const totalAvail = deptStaff.reduce((sum, p) => {
            const def = masterAvailability[p.id]?.defaultHours ?? 8;
            const mondayOverride = masterAvailability[p.id]?.overrides?.[mondayIso];
            return sum + (mondayOverride !== undefined ? mondayOverride : def * 5);
          }, 0);
          const totalSched = deptStaff.reduce((sum, p) => {
            const s = getWeeklyScheduled(p);
            return sum + s.total;
          }, 0);
          const pct = totalAvail > 0 ? Math.round(totalSched / totalAvail * 100) : 0;
          return (
            <div key={d} className="bg-white border border-slate-100 rounded-xl p-4">
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${DEPT_COLOR[d].split(' ')[1]}`}>
                {d.charAt(0).toUpperCase()+d.slice(1)}
              </p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-xl font-semibold text-slate-900">{totalSched}</span>
                <span className="text-xs text-slate-400 mb-0.5">/ {totalAvail} hrs this week</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-green-500' : 'bg-slate-300'}`}
                  style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{pct}% utilized · {Math.max(0, totalAvail - totalSched)}h free for flex</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Props from DashboardClient ────────────────────────────────────────────────

interface SchedulePageProps {
  utahDesignable?:    number;
  georgiaDesignable?: number;
  utahPreservation?:  number;
  georgiaPreservation?: number;
  utahFulfillment?:   number;
  georgiaFulfillment?: number;
  countsLoading?:     boolean;
}

// ─── Main SchedulePage ─────────────────────────────────────────────────────────

export function SchedulePage({
  utahDesignable    = 0,
  georgiaDesignable = 0,
  utahPreservation  = 0,
  georgiaPreservation = 0,
  utahFulfillment   = 0,
  georgiaFulfillment = 0,
  countsLoading     = false,
}: SchedulePageProps) {

  const [location, setLocation] = useState<'Utah' | 'Georgia'>('Utah');
  const [dept, setDept] = useState<'design' | 'preservation' | 'fulfillment' | 'master'>('design');

  // ── Supabase-persisted settings ───────────────────────────────────────────────
  const { settings, loading: settingsLoading, saveState, update } = useScheduleSettings(location);

  // Derive designers and schedule from persisted settings + defaults
  const defaultDesigners = location === 'Utah' ? DEFAULT_UTAH_DESIGNERS : DEFAULT_GEORGIA_DESIGNERS;
  const defaultSchedule  = location === 'Utah' ? buildDefaultUtahSchedule() : buildDefaultGeorgiaSchedule();

  // Merge persisted roster over defaults
  const designers: Designer[] = defaultDesigners.map(d => {
    const persisted = settings.designRoster[d.id];
    if (!persisted) return d;
    return { ...d, ratio: persisted.ratio, payType: persisted.payType, hourlyRate: persisted.hourlyRate, annualSalary: persisted.annualSalary };
  });

  // Merge persisted hours over defaults — schedule is array of WeekSchedule
  const schedule: WeekSchedule[] = Array.from({ length: WEEKS }, (_, w) => {
    const weekObj: WeekSchedule = {};
    designers.forEach(d => {
      weekObj[d.id] = settings.designHours[d.id]?.[w] ?? defaultSchedule[w]?.[d.id] ?? 0;
    });
    return weekObj;
  });

  // Preservation actuals from Supabase
  const [presActuals, setPresActuals] = useState<Record<string, number>>({});
  const [presActualsLoading, setPresActualsLoading] = useState(false);

  useEffect(() => {
    setPresActualsLoading(true);
    fetch(`/api/actuals?location=${location}&type=preservation&weeks=52`)
      .then(r => r.json())
      .then((d: { preservationActuals?: { week_of: string; received: number }[] }) => {
        const map: Record<string, number> = {};
        (d.preservationActuals ?? []).forEach(row => { map[row.week_of] = row.received; });
        setPresActuals(map);
      })
      .catch(() => {})
      .finally(() => setPresActualsLoading(false));
  }, [location]);

  // Team actuals from Supabase
  const [teamActuals, setTeamActuals] = useState<{
    department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number;
  }[]>([]);

  useEffect(() => {
    fetch(`/api/actuals?location=${location}&type=team&weeks=52`)
      .then(r => r.json())
      .then((d: { teamActuals?: typeof teamActuals }) => { setTeamActuals(d.teamActuals ?? []); })
      .catch(() => {});
  }, [location]);

  const weeklyEstimates = settings.weeklyEstimates;
  function setWeeklyEstimate(weekOf: string, val: number) {
    update('weeklyEstimates', { ...weeklyEstimates, [weekOf]: val });
  }

  const avgIntake = settings.avgIntake;
  function setAvgIntake(v: number) { update('avgIntake', v); }

  const [showRoster,   setShowRoster]  = useState(false);
  const [weekOffset,   setWeekOffset]  = useState(0);
  const [showCPO,      setShowCPO]     = useState(true);
  const [activeTab,    setActiveTab]   = useState<'schedule' | 'monthly' | 'queue' | 'historicals'>('schedule');
  const [deletedStack, setDeletedStack] = useState<{designer: Designer; schedule: WeekSchedule[]}[]>([]);

  // Live queue counts from parent (no more manual inputs)
  const designableQueue   = location === 'Utah' ? utahDesignable    : georgiaDesignable;
  const preservationQueue = location === 'Utah' ? utahPreservation  : georgiaPreservation;
  const fulfillmentQueue  = location === 'Utah' ? utahFulfillment   : georgiaFulfillment;

  // ── Roster handlers ──────────────────────────────────────────────────────────
  function handleDesignerChange(id: string, field: keyof Designer, value: string) {
    const currentRoster = { ...settings.designRoster };
    const existing = currentRoster[id] ?? designers.find(d => d.id === id) ?? {};
    if (field === 'name')    currentRoster[id] = { ...existing, name: value } as typeof currentRoster[string];
    else if (field === 'payType') currentRoster[id] = { ...existing, payType: value as PayType } as typeof currentRoster[string];
    else currentRoster[id] = { ...existing, [field]: parseFloat(value) || 0 } as typeof currentRoster[string];
    update('designRoster', currentRoster);
  }
  function handleAddDesigner() {
    const id = `${location.toLowerCase()}-${Date.now()}`;
    const newRoster = { ...settings.designRoster, [id]: { id, name: 'New Designer', ratio: 1.5, payType: 'hourly' as PayType, hourlyRate: 0, annualSalary: 0 } };
    update('designRoster', newRoster);
    // Add empty hours for new designer
    const newHours = { ...settings.designHours, [id]: Array(WEEKS).fill(0) };
    update('designHours', newHours);
  }
  function handleRemoveDesigner(id: string) {
    const designer = designers.find(d => d.id === id);
    if (designer) setDeletedStack(prev => [...prev, { designer, schedule: schedule.map(w => ({ ...w })) }]);
    const newRoster = { ...settings.designRoster };
    delete newRoster[id];
    update('designRoster', newRoster);
    const newHours = { ...settings.designHours };
    delete newHours[id];
    update('designHours', newHours);
  }
  function handleUndo() {
    const last = deletedStack[deletedStack.length - 1];
    if (!last) return;
    // Restore roster entry
    const newRoster = { ...settings.designRoster, [last.designer.id]: last.designer as unknown as typeof settings.designRoster[string] };
    update('designRoster', newRoster);
    setDeletedStack(prev => prev.slice(0, -1));
  }

  // ── Schedule handlers ─────────────────────────────────────────────────────────
  function handleHoursChange(weekIdx: number, designerId: string, value: string) {
    const newHours = { ...settings.designHours };
    if (!newHours[designerId]) {
      const def = location === 'Utah' ? buildDefaultUtahSchedule() : buildDefaultGeorgiaSchedule();
      newHours[designerId] = Array.from({ length: WEEKS }, (_, w) => def[w]?.[designerId] ?? 0);
    }
    newHours[designerId] = [...newHours[designerId]];
    newHours[designerId][weekIdx] = parseFloat(value) || 0;
    update('designHours', newHours);
  }
  function applyToAllWeeks(designerId: string, hours: number) {
    const newHours = { ...settings.designHours, [designerId]: Array(WEEKS).fill(hours) };
    update('designHours', newHours);
  }

  // ── Per-designer stats ────────────────────────────────────────────────────────
  function weekStats(weekIdx: number, d: Designer) {
    const hrs    = schedule[weekIdx]?.[d.id] ?? 0;
    const frames = d.ratio > 0 ? hrs / d.ratio : 0;
    const cost   = d.payType === 'salary' ? d.annualSalary / 52 : hrs * d.hourlyRate;
    const cpo    = frames > 0 && cost > 0 ? cost / frames : null;
    return { hrs, frames, cost, cpo };
  }

  // ── Weekly totals ─────────────────────────────────────────────────────────────
  const weeklyTotals = useMemo(() =>
    Array.from({ length: WEEKS }, (_, w) => {
      let totalFrames = 0, totalCost = 0;
      designers.forEach(d => {
        const { frames, cost } = weekStats(w, d);
        totalFrames += frames;
        totalCost   += cost;
      });
      return { totalFrames, totalCost, totalCPO: totalFrames > 0 && totalCost > 0 ? totalCost / totalFrames : null };
    }),
    [schedule, designers] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Monthly aggregation ───────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map: Record<string, {
      monthKey: string; weeks: number; totalFrames: number; totalCost: number; totalHours: number;
      byDesigner: Record<string, { frames: number; cost: number; hrs: number }>;
    }> = {};
    for (let w = 0; w < WEEKS; w++) {
      const key = getMonthKey(w);
      if (!map[key]) map[key] = { monthKey: key, weeks: 0, totalFrames: 0, totalCost: 0, totalHours: 0, byDesigner: {} };
      map[key].weeks++;
      map[key].totalFrames += weeklyTotals[w].totalFrames;
      map[key].totalCost   += weeklyTotals[w].totalCost;
      designers.forEach(d => {
        const { frames, cost, hrs } = weekStats(w, d);
        if (!map[key].byDesigner[d.id]) map[key].byDesigner[d.id] = { frames: 0, cost: 0, hrs: 0 };
        map[key].byDesigner[d.id].frames += frames;
        map[key].byDesigner[d.id].cost   += cost;
        map[key].byDesigner[d.id].hrs    += hrs;
        map[key].totalHours += hrs;
      });
    }
    return Object.values(map).map(m => ({
      ...m,
      monthlyRatio: m.totalFrames > 0 ? m.totalHours  / m.totalFrames : null,
      monthlyCPO:   m.totalFrames > 0 && m.totalCost > 0 ? m.totalCost / m.totalFrames : null,
    }));
  }, [weeklyTotals, designers, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Future turnaround ────────────────────────────────────────────────────────
  const futureTurnarounds = useMemo(() => {
    const graduating: number[] = Array.from({ length: WEEKS }, (_, w) => {
      const graduatingDate = getMondayDate(w - PRESERVATION_WEEKS);
      const graduatingIso  = graduatingDate.toISOString().split('T')[0];
      const intakeData     = location === 'Utah' ? UTAH_HISTORICAL_INTAKE : GEORGIA_HISTORICAL_INTAKE;
      // Priority: 1) Supabase actuals, 2) hardcoded historical, 3) per-week estimate, 4) avg
      if (presActuals[graduatingIso] !== undefined) return presActuals[graduatingIso];
      const hist = intakeData.find(h => h.weekOf === graduatingIso);
      if (hist) return hist.actual;
      if (weeklyEstimates[graduatingIso] !== undefined) return weeklyEstimates[graduatingIso];
      return avgIntake;
    });
    const queueAtStart: number[] = [designableQueue];
    for (let w = 0; w < WEEKS - 1; w++) {
      const afterDrain    = Math.max(0, queueAtStart[w] - weeklyTotals[w].totalFrames);
      const afterGraduate = afterDrain + graduating[w + 1];
      queueAtStart.push(afterGraduate);
    }
    return Array.from({ length: WEEKS }, (_, w) => {
      const graduateWeek = w + PRESERVATION_WEEKS;
      if (graduateWeek >= WEEKS) return null;
      const queueAhead = queueAtStart[graduateWeek];
      const cohortSize = graduating[w];
      let remaining    = queueAhead + cohortSize;
      for (let fw = graduateWeek; fw < WEEKS; fw++) {
        remaining -= weeklyTotals[fw].totalFrames;
        if (remaining <= 0) return fw - w;
      }
      return null;
    });
  }, [designableQueue, avgIntake, weeklyTotals, presActuals, weeklyEstimates, location]);

  // ── Historical remaining ─────────────────────────────────────────────────────
  const historicalRemaining = useMemo(() => {
    const hardcoded = location === 'Utah' ? UTAH_HISTORICAL_INTAKE : GEORGIA_HISTORICAL_INTAKE;
    // Merge: presActuals override hardcoded; include any actuals weeks not in hardcoded
    const allWeeks = new Set([...hardcoded.map(h => h.weekOf), ...Object.keys(presActuals)]);
    const historicalIntake = [...allWeeks].sort().map(weekOf => ({
      weekOf,
      actual: presActuals[weekOf] ?? hardcoded.find(h => h.weekOf === weekOf)?.actual ?? 0,
    })).filter(h => h.actual > 0);
    if (!historicalIntake.length) return [];
    const today = getMondayDate(0);
    const designableCohorts: { weekOf: string; count: number }[] = [];
    const inPreservationCohorts: { weekOf: string; count: number; weeksLeft: number }[] = [];
    historicalIntake.forEach(({ weekOf, actual }) => {
      const intakeDate = new Date(weekOf + 'T12:00:00');
      const ageWeeks   = Math.floor((today.getTime() - intakeDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (ageWeeks >= PRESERVATION_WEEKS) {
        designableCohorts.push({ weekOf, count: actual });
      } else {
        inPreservationCohorts.push({ weekOf, count: actual, weeksLeft: PRESERVATION_WEEKS - ageWeeks });
      }
    });
    const totalFromHistory = designableCohorts.reduce((s, c) => s + c.count, 0);
    const alreadyDesigned  = Math.max(0, totalFromHistory - designableQueue);
    let trimRemaining = alreadyDesigned;
    const queueCohorts: { weekOf: string; remaining: number }[] = [];
    for (const c of designableCohorts) {
      if (trimRemaining >= c.count) {
        queueCohorts.push({ weekOf: c.weekOf, remaining: 0 });
        trimRemaining -= c.count;
      } else {
        queueCohorts.push({ weekOf: c.weekOf, remaining: c.count - trimRemaining });
        trimRemaining = 0;
      }
    }
    const results: { weekOf: string; weeksFromNow: number | null; alreadyDone: boolean }[] =
      queueCohorts.map(c => ({ weekOf: c.weekOf, weeksFromNow: null, alreadyDone: c.remaining === 0 }));
    let cohortIdx = queueCohorts.findIndex(c => c.remaining > 0);
    if (cohortIdx === -1) cohortIdx = queueCohorts.length;
    let remainingInCohort = queueCohorts[cohortIdx]?.remaining ?? 0;
    for (let w = 0; w < WEEKS && cohortIdx < queueCohorts.length; w++) {
      let capacity = weeklyTotals[w].totalFrames;
      while (capacity > 0 && cohortIdx < queueCohorts.length) {
        if (remainingInCohort <= capacity) {
          results[cohortIdx].weeksFromNow = w;
          capacity -= remainingInCohort;
          cohortIdx++;
          remainingInCohort = queueCohorts[cohortIdx]?.remaining ?? 0;
        } else {
          remainingInCohort -= capacity;
          capacity = 0;
        }
      }
    }
    const queueAfterWeek: number[] = [];
    { let q = designableQueue;
      for (let w = 0; w < WEEKS; w++) {
        q = Math.max(0, q - weeklyTotals[w].totalFrames);
        queueAfterWeek.push(q);
      }
    }
    const presResults = inPreservationCohorts.map(c => {
      const joinWeek   = c.weeksLeft;
      const queueAtJoin = joinWeek === 0 ? designableQueue : (queueAfterWeek[joinWeek - 1] ?? 0);
      let remaining    = queueAtJoin + c.count;
      let designedAtWeek: number | null = null;
      for (let fw = joinWeek; fw < WEEKS; fw++) {
        remaining -= weeklyTotals[fw].totalFrames;
        if (remaining <= 0) { designedAtWeek = fw; break; }
      }
      return { weekOf: c.weekOf, weeksFromNow: designedAtWeek, alreadyDone: false, inPreservation: true, preservationWeeksLeft: c.weeksLeft };
    });
    return [...results, ...presResults].sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  }, [location, designableQueue, weeklyTotals, presActuals]);

  const windowWeeks = Array.from({ length: WINDOW }, (_, i) => i + weekOffset).filter(i => i < WEEKS);
  const hasRates    = designers.some(d =>
    (d.payType === 'hourly' && d.hourlyRate > 0) ||
    (d.payType === 'salary' && d.annualSalary > 0)
  );

  return (
    <div className="space-y-6">

      {/* ── Dept tabs + Location toggle + Save indicator ────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {([
              ['design',       'Design'],
              ['preservation', 'Preservation'],
              ['fulfillment',  'Fulfillment'],
              ['master',       'Master Schedule'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setDept(id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  dept === id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Save state indicator */}
          {settingsLoading && (
            <span className="text-xs text-slate-400 italic">Loading saved settings…</span>
          )}
          {saveState === 'saving' && (
            <span className="text-xs text-slate-400">Saving…</span>
          )}
          {saveState === 'saved' && (
            <span className="text-xs text-green-600">✓ Saved</span>
          )}
          {saveState === 'error' && (
            <span className="text-xs text-red-500">Save failed — check connection</span>
          )}
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {(['Utah', 'Georgia'] as const).map(loc => (
            <button key={loc} onClick={() => setLocation(loc)}
              className={`px-5 py-2 transition-colors ${
                location === loc ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}>
              {loc}
            </button>
          ))}
        </div>
      </div>

      {/* ── PRESERVATION dept ───────────────────────────────────────────────── */}
      {dept === 'preservation' && (
        <PreservationSection
          location={location}
          preservationQueue={preservationQueue}
          countsLoading={countsLoading}
          teamActuals={teamActuals}
          presHours={settings.presHours}
          presRoster={settings.presRoster}
          presSettings={settings.presSettings}
          onPresHoursChange={(h) => update('presHours', h)}
          onPresRosterChange={(r) => update('presRoster', r)}
          onPresSettingsChange={(s) => update('presSettings', s)}
          onActualsSaved={() => {
            fetch(`/api/actuals?location=${location}&type=all&weeks=52`)
              .then(r => r.json())
              .then((d: { preservationActuals?: { week_of: string; received: number }[]; teamActuals?: typeof teamActuals }) => {
                const map: Record<string, number> = {};
                (d.preservationActuals ?? []).forEach(row => { map[row.week_of] = row.received; });
                setPresActuals(map);
                setTeamActuals(d.teamActuals ?? []);
              })
              .catch(() => {});
          }}
        />
      )}

      {/* ── FULFILLMENT dept ────────────────────────────────────────────────── */}
      {dept === 'fulfillment' && (
        <FulfillmentSection
          location={location}
          fulfillmentQueue={fulfillmentQueue}
          countsLoading={countsLoading}
          teamActuals={teamActuals}
          ffHours={settings.ffHours}
          ffRoster={settings.ffRoster}
          onFfHoursChange={(h) => update('ffHours', h)}
          onFfRosterChange={(r) => update('ffRoster', r)}
          onActualsSaved={() => {
            fetch(`/api/actuals?location=${location}&type=team&weeks=52`)
              .then(r => r.json())
              .then((d: { teamActuals?: typeof teamActuals }) => setTeamActuals(d.teamActuals ?? []))
              .catch(() => {});
          }}
        />
      )}

      {/* ── DESIGN dept ─────────────────────────────────────────────────────── */}
      {dept === 'design' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Designable queue — live from dept dashboard */}
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Designable queue</p>
              <p className="text-xs text-slate-400 mb-2">Ready to Frame + Almost Ready</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-indigo-700">
                  {countsLoading ? '…' : designableQueue.toLocaleString()}
                </p>
                <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded px-1.5 py-0.5">live</span>
              </div>
            </div>

            {/* Preservation pipeline — live from dept dashboard */}
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Preservation pipeline</p>
              <p className="text-xs text-slate-400 mb-2">Bouquet Received → In Progress</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-green-700">
                  {countsLoading ? '…' : preservationQueue.toLocaleString()}
                </p>
                <span className="text-[10px] bg-green-100 text-green-600 rounded px-1.5 py-0.5">live</span>
              </div>
            </div>

            {/* Est. bouquets delivered — renamed and clarified */}
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Est. bouquets/week delivered</p>
              <p className="text-xs text-slate-400 mb-2">fallback when no per-week estimate set</p>
              <input type="number" value={avgIntake} onChange={e => setAvgIntake(parseInt(e.target.value) || 0)}
                className="w-20 border border-slate-200 rounded px-2 py-1 text-xl font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>

            {/* This week capacity */}
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">This week capacity</p>
              <p className="text-xl font-semibold text-slate-900">
                {Math.round(weeklyTotals[0].totalFrames)}
                <span className="text-sm font-normal text-slate-400 ml-1">frames</span>
              </p>
              {hasRates && weeklyTotals[0].totalCPO !== null && (
                <p className="text-xs text-amber-600 mt-1 font-medium">CPO: {fmt$(weeklyTotals[0].totalCPO)}</p>
              )}
            </div>
          </div>

          {/* Roster editor */}
          <div>
            <button onClick={() => setShowRoster(r => !r)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              {showRoster ? '▲ Hide' : '▼ Edit'} designer roster, ratios &amp; pay rates
            </button>
            {showRoster && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-5">
                <RosterEditor
                  designers={designers}
                  onChange={handleDesignerChange}
                  onAdd={handleAddDesigner}
                  onRemove={handleRemoveDesigner}
                />
                {deletedStack.length > 0 && (
                  <button onClick={handleUndo}
                    className="mt-3 text-xs px-3 py-1 border border-amber-200 rounded text-amber-600 hover:bg-amber-50 transition-colors">
                    ↩ Undo remove &quot;{deletedStack[deletedStack.length - 1].designer.name}&quot;
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Inner tabs */}
          <div className="flex border-b border-slate-200">
            {([
              ['schedule',    'Weekly Schedule'],
              ['queue',       'Queue & Turnaround'],
              ['monthly',     'Monthly Summary'],
              ['historicals', 'Historicals'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── WEEKLY SCHEDULE TAB ─────────────────────────────────────────── */}
          {activeTab === 'schedule' && (
            <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-sm font-semibold text-slate-700">Hours per designer per week</h2>
                  {hasRates && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={showCPO} onChange={e => setShowCPO(e.target.checked)} className="rounded" />
                      Show CPO
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeekOffset(Math.max(0, weekOffset - WINDOW))} disabled={weekOffset === 0}
                    className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">← Prev</button>
                  <span className="text-xs text-slate-400">
                    {getWeekLabel(weekOffset)} – {getWeekLabel(weekOffset + WINDOW - 1)}
                  </span>
                  <button onClick={() => setWeekOffset(Math.min(WEEKS - WINDOW, weekOffset + WINDOW))} disabled={weekOffset + WINDOW >= WEEKS}
                    className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">Next →</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[140px]">Designer</th>
                      {windowWeeks.map(w => (
                        <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px]">
                          {getWeekLabel(w)}
                          {w === 0 && <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded px-1">now</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {designers.map((d, di) => (
                      <tr key={d.id} className={`border-b border-slate-50 ${di % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                        <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                          <div className="font-medium text-slate-700">{d.name}</div>
                          <div className="text-slate-400">{d.ratio} h/f</div>
                          {d.payType === 'salary' && <div className="text-[10px] text-amber-600">salary</div>}
                        </td>
                        {windowWeeks.map(w => {
                          const { hrs, frames, cpo } = weekStats(w, d);
                          return (
                            <td key={w} className={`px-2 py-1.5 text-center ${w === 0 ? 'bg-indigo-50/30' : ''}`}>
                              <input
                                type="number" value={hrs || ''} min="0" step="0.5" placeholder="0"
                                onChange={e => handleHoursChange(w, d.id, e.target.value)}
                                onDoubleClick={() => applyToAllWeeks(d.id, hrs)}
                                title="Double-click to apply to all weeks"
                                className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              />
                              {frames > 0 && (
                                <div className="text-slate-400 mt-0.5">{Math.round(frames)}f</div>
                              )}
                              {showCPO && cpo !== null && (
                                <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Week total</td>
                      {windowWeeks.map(w => {
                        const t = weeklyTotals[w];
                        return (
                          <td key={w} className={`px-2 py-2 text-center ${w === 0 ? 'bg-indigo-50/50' : ''}`}>
                            <div className="text-indigo-700">{Math.round(t.totalFrames)}f</div>
                            {hasRates && t.totalCPO !== null && (
                              <div className="text-amber-600 text-[10px]">{fmt$(t.totalCPO)}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── QUEUE & TURNAROUND TAB ──────────────────────────────────────── */}
          {activeTab === 'queue' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-1">Future turnaround — orders arriving each week</h2>
                <p className="text-xs text-slate-400 mb-1">
                  For bouquets received in a future week: estimated total weeks from bouquet received to frame completed.
                  Includes fixed {PRESERVATION_WEEKS}-week preservation pipeline.
                </p>
                <p className="text-xs text-amber-600 mb-4">Under 8 weeks total = overstaffed.</p>
                <div className="space-y-2.5">
                  {futureTurnarounds.slice(0, 20).map((designWait, w) => {
                    const total       = designWait;
                    const overstaffed = total !== null && total < 8;
                    const { bar, text, label } = turnaroundColors(total, overstaffed);
                    const weekIso = isoMonday(w);
                    const estVal  = weeklyEstimates[weekIso] ?? '';
                    return (
                      <div key={w} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 w-16 shrink-0">{getWeekLabel(w)}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            value={estVal}
                            placeholder={String(avgIntake)}
                            min="0"
                            onChange={e => setWeeklyEstimate(weekIso, parseInt(e.target.value) || 0)}
                            className="w-14 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-center text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                            title="Est. bouquets delivered this week"
                          />
                          <span className="text-[10px] text-slate-300">bq</span>
                        </div>
                        {total !== null ? (
                          <>
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="h-2 flex rounded-full overflow-hidden" style={{ width: `${Math.min(100, (total / 22) * 100)}%` }}>
                                <div className="bg-slate-300 shrink-0" style={{ width: `${(PRESERVATION_WEEKS / total) * 100}%` }} />
                                <div className={`${bar} flex-1`} />
                              </div>
                            </div>
                            <span className={`text-xs font-medium w-44 text-right shrink-0 ${text}`}>{label}</span>
                          </>
                        ) : (
                          <span className="text-xs text-red-600 italic">queue not cleared in 52 wks</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-5 pt-4 border-t border-slate-100 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> 6 wks preservation</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> &lt;8 wks overstaffed</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> 8–10 ideal</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 11–18 backlog</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> &gt;18 large backlog</span>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Weeks remaining until design — past intake cohorts</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    For bouquets already received: estimated weeks from today until their cohort reaches the front of the FIFO design queue.
                    Based on {location} designable queue of {designableQueue.toLocaleString()} orders and scheduled capacity.
                  </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Intake week</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-500">Received</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-500">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">Weeks until designed</th>
                          <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">Total to design</th>
                          <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">Total w/ fulfillment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalRemaining.map((row, i) => {
                          const inPres    = 'inPreservation' in row && row.inPreservation;
                          const done      = 'alreadyDone'   in row && row.alreadyDone;
                          const weeksLeft = row.weeksFromNow;
                          const weeksElapsed = Math.round((getMondayDate(0).getTime() - new Date(row.weekOf + 'T12:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000));
                          const totalToDesign        = (!done && weeksLeft !== null) ? weeksElapsed + weeksLeft : null;
                          const totalWithFulfillment = totalToDesign !== null ? totalToDesign + 2 : null;
                          // Received: presActuals (from preservation historicals) take priority over hardcoded
                          const receivedVal = presActuals[row.weekOf]
                            ?? (location === 'Utah' ? UTAH_HISTORICAL_INTAKE : GEORGIA_HISTORICAL_INTAKE).find(h => h.weekOf === row.weekOf)?.actual
                            ?? '—';
                          return (
                            <tr key={i} className={`border-b border-slate-50 ${
                              done ? 'bg-slate-50 opacity-50' : inPres ? 'bg-green-50/30' : weeksLeft === 0 ? 'bg-indigo-50/40' : 'hover:bg-slate-50'
                            }`}>
                              <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                                {fmtDate(row.weekOf)}
                                {done && <span className="ml-2 text-[10px] bg-slate-200 text-slate-500 rounded px-1 py-px">✓ designed</span>}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600">
                                {presActuals[row.weekOf] !== undefined
                                  ? <span className="text-green-700 font-medium">{receivedVal}</span>
                                  : receivedVal}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {done ? (
                                  <span className="text-slate-400 text-[10px]">complete</span>
                                ) : inPres ? (
                                  <span className="text-green-700 text-[10px] bg-green-100 rounded px-1.5 py-0.5">
                                    still drying — {('preservationWeeksLeft' in row ? (row as {preservationWeeksLeft: number}).preservationWeeksLeft : 0)} wks left
                                  </span>
                                ) : weeksLeft === 0 ? (
                                  <span className="text-indigo-700 text-[10px] bg-indigo-100 rounded px-1.5 py-0.5">designing now</span>
                                ) : (
                                  <span className="text-slate-500 text-[10px]">in design queue</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {done ? (
                                  <span className="text-xs text-slate-400 italic">already designed</span>
                                ) : inPres ? (
                                  <span className="text-xs text-slate-400 italic">
                                    enters queue in ~{('preservationWeeksLeft' in row ? (row as {preservationWeeksLeft: number}).preservationWeeksLeft : 0)} wks,
                                    then ~{weeksLeft !== null ? weeksLeft - ('preservationWeeksLeft' in row ? (row as {preservationWeeksLeft: number}).preservationWeeksLeft : 0) : '?'} wks in design queue
                                  </span>
                                ) : weeksLeft === null ? (
                                  <span className="text-xs text-red-400 italic">not cleared in 52 wks</span>
                                ) : weeksLeft === 0 ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-indigo-200 rounded-full h-1.5 max-w-32">
                                      <div className="h-1.5 rounded-full bg-indigo-500 w-full" />
                                    </div>
                                    <span className="text-xs font-semibold text-indigo-700">this week</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-32">
                                      <div className={`h-1.5 rounded-full ${weeksLeft <= 4 ? 'bg-green-400' : weeksLeft <= 8 ? 'bg-amber-400' : weeksLeft <= 14 ? 'bg-orange-400' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(100, (weeksLeft / 16) * 100)}%` }} />
                                    </div>
                                    <span className={`text-xs font-medium whitespace-nowrap ${weeksLeft <= 4 ? 'text-green-700' : weeksLeft <= 8 ? 'text-amber-700' : weeksLeft <= 14 ? 'text-orange-700' : 'text-red-700'}`}>
                                      ~{weeksLeft} wk{weeksLeft !== 1 ? 's' : ''} from now
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {totalToDesign !== null ? (
                                  <span className={`text-xs font-semibold ${totalToDesign <= 10 ? 'text-green-700' : totalToDesign <= 18 ? 'text-amber-700' : 'text-red-700'}`}>
                                    ~{totalToDesign} wks
                                  </span>
                                ) : done ? <span className="text-xs text-slate-300">—</span>
                                         : <span className="text-xs text-slate-400">TBD</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {totalWithFulfillment !== null ? (
                                  <span className={`text-xs font-semibold ${totalWithFulfillment <= 12 ? 'text-green-700' : totalWithFulfillment <= 20 ? 'text-amber-700' : 'text-red-700'}`}>
                                    ~{totalWithFulfillment} wks
                                  </span>
                                ) : done ? <span className="text-xs text-slate-300">—</span>
                                         : <span className="text-xs text-slate-400">TBD</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              </div>
            </div>
          )}

          {/* ── MONTHLY SUMMARY TAB ─────────────────────────────────────────── */}
          {activeTab === 'monthly' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Monthly summary</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Each week attributed to the month of its Monday. Monthly ratio = total hours ÷ total frames.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-2 text-left font-medium text-slate-500">Month</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Weeks</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Total frames</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Total hours</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Monthly ratio</th>
                        {hasRates && <th className="px-3 py-2 text-right font-medium text-slate-500">Total labor</th>}
                        {hasRates && <th className="px-3 py-2 text-right font-medium text-slate-500">Monthly CPO</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((m, i) => (
                        <tr key={m.monthKey} className={`border-b border-slate-50 ${i === 0 ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                            {m.monthKey}
                            {i === 0 && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 rounded px-1 py-px">current</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{m.weeks}</td>
                          <td className="px-3 py-2 text-right font-medium text-indigo-700">{Math.round(m.totalFrames)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{Math.round(m.totalHours)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">
                            {m.monthlyRatio !== null ? `${Math.round(m.monthlyRatio * 100) / 100} hrs/frame` : '—'}
                          </td>
                          {hasRates && <td className="px-3 py-2 text-right text-slate-500">{m.totalCost > 0 ? fmt$(m.totalCost) : '—'}</td>}
                          {hasRates && <td className="px-3 py-2 text-right font-medium text-amber-700">{m.monthlyCPO !== null ? fmt$(m.monthlyCPO) : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Per-designer monthly breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Designer</th>
                        {monthlyData.slice(0, 6).map(m => (
                          <th key={m.monthKey} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[120px]">
                            {m.monthKey.split(' ')[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {designers.map((d, di) => (
                        <tr key={d.id} className={di % 2 === 0 ? '' : 'bg-slate-50/40'}>
                          <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                            {d.name}
                            {d.payType === 'salary' && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 rounded px-1 py-px">salary</span>}
                          </td>
                          {monthlyData.slice(0, 6).map(m => {
                            const s = m.byDesigner[d.id];
                            if (!s || s.frames === 0) return <td key={m.monthKey} className="px-3 py-2 text-center text-slate-200">—</td>;
                            const mCPO = s.cost > 0 && s.frames > 0 ? s.cost / s.frames : null;
                            return (
                              <td key={m.monthKey} className="px-3 py-2 text-center">
                                <div className="font-medium text-indigo-700">{Math.round(s.frames)}f</div>
                                <div className="text-slate-400">{Math.round(s.hrs)}h</div>
                                {hasRates && mCPO !== null && <div className="text-amber-600">{fmt$(mCPO)}</div>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORICALS TAB ─────────────────────────────────────────────── */}
          {activeTab === 'historicals' && (
            <HistoricalsTab
              designers={designers}
              location={location}
              teamActuals={teamActuals}
              onActualsSaved={() => {
                fetch(`/api/actuals?location=${location}&type=team&weeks=52`)
                  .then(r => r.json())
                  .then((d: { teamActuals?: typeof teamActuals }) => setTeamActuals(d.teamActuals ?? []))
                  .catch(() => {});
              }}
            />
          )}

        </>
      )}

      {/* ── MASTER SCHEDULE ─────────────────────────────────────────────────── */}
      {dept === 'master' && (
        <MasterScheduleSection
          location={location}
          masterAvailability={settings.masterAvailability}
          onAvailabilityChange={(a) => update('masterAvailability', a)}
          designHours={settings.designHours}
          designSchedule={schedule}
          presHours={settings.presHours}
          ffHours={settings.ffHours}
          designRoster={settings.designRoster}
          presRoster={settings.presRoster}
          ffRoster={settings.ffRoster}
        />
      )}

    </div>
  );
}
