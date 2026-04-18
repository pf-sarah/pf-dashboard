'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { HistoricalsSection } from './HistoricalsSection';
import { useHistoricalMetrics } from './useHistoricalMetrics';
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
  isManager?:   boolean;
  role?:        'specialist' | 'senior' | 'master';
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
  { id: 'ut-mgr', name: 'Jennika Merrill',  ratio: 1.4, payType: 'salary', hourlyRate: 0, annualSalary: 0, isManager: true, role: 'master' as const },
  { id: 'ut-1',   name: 'Deanna L Brown',   ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ut-2',   name: 'Sarah Glissmeyer', ratio: 1.8, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ut-3',   name: 'Kathryn Hill',     ratio: 1.4, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ut-4',   name: 'Mia Legas',        ratio: 1.2, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ut-5',   name: 'Sloane James',     ratio: 1.2, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ut-6',   name: 'Audrey Brown',     ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'specialist' as const },
  { id: 'ut-7',   name: 'Chloe Leonard',    ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'specialist' as const },
];

const DEFAULT_GEORGIA_DESIGNERS: Designer[] = [
  { id: 'ga-1', name: 'Katherine Piper', ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ga-2', name: 'Allanna Harlan',  ratio: 1.6, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ga-3', name: 'Erin Webb',       ratio: 2.3, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
  { id: 'ga-4', name: 'Rachel Tucker',   ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'specialist' as const },
  { id: 'ga-5', name: 'Celt Stewart',    ratio: 2.0, payType: 'hourly', hourlyRate: 0, annualSalary: 0, role: 'senior' as const },
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
      <div className="grid grid-cols-[1fr_80px_80px_80px_110px_130px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
        <span>Name</span>
        <span className="text-center">Role</span>
        <span className="text-center">Pay type</span>
        <span className="text-center">Ratio</span>
        <span className="text-center">Hourly rate</span>
        <span className="text-center">Annual salary</span>
        <span />
      </div>
      <div className="space-y-2">
        {designers.map(d => (
          <div key={d.id} className="grid grid-cols-[1fr_80px_80px_80px_110px_130px_20px] gap-2 items-center">
            <input type="text" value={d.name} onChange={e => onChange(d.id, 'name', e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <select value={(d as {role?:string}).role ?? 'specialist'} onChange={e => onChange(d.id, 'role', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="specialist">Specialist</option>
              <option value="senior">Senior</option>
              <option value="master">Master</option>
            </select>
            <select value={d.payType} onChange={e => onChange(d.id, 'payType', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
            <div className="flex items-center gap-1">
              <input type="number" value={d.ratio} step="0.1" min="0.1"
                onChange={e => onChange(d.id, 'ratio', e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={() => refreshRatio(d)} title="Update ratio from last 4 weeks of historicals"
                className="text-slate-300 hover:text-indigo-500 transition-colors text-sm shrink-0"
                disabled={refreshingId === d.id}>
                {refreshingId === d.id ? '…' : '↻'}
              </button>
            </div>
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

const UTAH_PRESERVATION_TEAM: PresTeamMember[] = [
  { id: 'ut-p1', name: 'Katelyn Wilson', ratio: 0.7, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(8), isManager: true, role: 'master' as const },
  { id: 'ut-p2', name: 'Emma Dunakey',   ratio: 0.5, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(8), role: 'senior' as const },
  { id: 'ut-p3', name: 'Flex',           ratio: 1.0, pay: 'flex'   as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(0) },
  { id: 'ut-p4', name: 'On Call',        ratio: 1.0, pay: 'oncall' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(0) },
];

const GEORGIA_PRESERVATION_TEAM: PresTeamMember[] = [
  { id: 'ga-p1', name: 'Amber Garrett', ratio: 0.42, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(8), isManager: true, role: 'master' as const },
  { id: 'ga-p2', name: 'Celt Stewart',  ratio: 0.5,  pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(8), role: 'senior' as const },
  { id: 'ga-p3', name: 'Flex',          ratio: 1.0,  pay: 'flex'   as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(0) },
  { id: 'ga-p4', name: 'On Call',       ratio: 1.0,  pay: 'oncall' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(5).fill(0) },
];

const UTAH_FULFILLMENT_TEAM: FfTeamMember[] = [
  { id: 'ut-f1', name: 'Izabella DePrima',       ratio: 1.0,  pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), isManager: true, role: 'master' as const },
  { id: 'ut-f2', name: 'Warner Neuenschwander',  ratio: 0.5,  pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), role: 'specialist' as const },
  { id: 'ut-f3', name: 'Owen Shaw',              ratio: 0.35, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), role: 'senior' as const },
  { id: 'ut-f4', name: 'Emma Swenson',           ratio: 0.37, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), role: 'senior' as const },
];

const GEORGIA_FULFILLMENT_TEAM: FfTeamMember[] = [
  { id: 'ga-f1', name: 'Yann Jean-Louis', ratio: 2.0,  pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), isManager: true, role: 'master' as const },
  { id: 'ga-f2', name: 'Nahid Knight',    ratio: 0.75, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), role: 'specialist' as const },
  { id: 'ga-f3', name: 'Shantel Phifer',  ratio: 0.61, pay: 'hourly' as const, payType: 'hourly' as const, rate: 0, annualSalary: 0, hours: Array(8).fill(8), role: 'specialist' as const },
];

type PresTeamMember = { id: string; name: string; ratio: number; pay: 'hourly'|'flex'|'oncall'; payType: 'hourly'|'salary'; rate: number; annualSalary: number; hours: number[]; isManager?: boolean; role?: 'specialist'|'senior'|'master' };
type FfTeamMember   = { id: string; name: string; ratio: number; pay: 'hourly'; payType: 'hourly'|'salary'; rate: number; annualSalary: number; hours: number[]; isManager?: boolean; role?: 'specialist'|'senior'|'master' };

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

// ─── Per-week CSV historical data — Utah ─────────────────────────────────────
const UTAH_HISTORICALS_BY_WEEK: Record<string, { weekOf: string; members: Record<string, { hours: number; orders: number }> }[]> = {
  fulfillment: [
  { weekOf: '2025-12-29', members: {
    'Owen Shaw': { hours: 6.25, orders: 15 },
    'Emma Swenson': { hours: 0, orders: 0 },
    'Warner Neuenschwander': { hours: 0, orders: 0 },
    'Izabella DePrima': { hours: 2.59, orders: 0 }
  } },
  { weekOf: '2026-01-05', members: {
    'Owen Shaw': { hours: 10.41, orders: 23 },
    'Emma Swenson': { hours: 9.77, orders: 21 },
    'Warner Neuenschwander': { hours: 3.73, orders: 16 },
    'Izabella DePrima': { hours: 40.06, orders: 10 }
  } },
  { weekOf: '2026-01-12', members: {
    'Owen Shaw': { hours: 19.8, orders: 44 },
    'Emma Swenson': { hours: 6.67, orders: 25 },
    'Warner Neuenschwander': { hours: 5.73, orders: 18 },
    'Izabella DePrima': { hours: 33.2, orders: 8 }
  } },
  { weekOf: '2026-01-19', members: {
    'Owen Shaw': { hours: 14.12, orders: 40 },
    'Emma Swenson': { hours: 12.09, orders: 31 },
    'Warner Neuenschwander': { hours: 1.12, orders: 8 },
    'Izabella DePrima': { hours: 39.95, orders: 21 }
  } },
  { weekOf: '2026-01-26', members: {
    'Owen Shaw': { hours: 13.85, orders: 31 },
    'Emma Swenson': { hours: 6.1, orders: 17 },
    'Warner Neuenschwander': { hours: 2.07, orders: 5 },
    'Izabella DePrima': { hours: 28.11, orders: 12 }
  } },
  { weekOf: '2026-02-02', members: {
    'Owen Shaw': { hours: 7.41, orders: 21 },
    'Emma Swenson': { hours: 6.86, orders: 15 },
    'Warner Neuenschwander': { hours: 7.17, orders: 13 },
    'Izabella DePrima': { hours: 6.53, orders: 0 }
  } },
  { weekOf: '2026-02-09', members: {
    'Owen Shaw': { hours: 22.71, orders: 55 },
    'Emma Swenson': { hours: 4.65, orders: 9 },
    'Warner Neuenschwander': { hours: 7.21, orders: 9 },
    'Izabella DePrima': { hours: 39.6, orders: 22 }
  } },
  { weekOf: '2026-02-16', members: {
    'Owen Shaw': { hours: 17.19, orders: 55 },
    'Emma Swenson': { hours: 6.43, orders: 14 },
    'Warner Neuenschwander': { hours: 3.86, orders: 23 },
    'Izabella DePrima': { hours: 38.67, orders: 26 }
  } },
  { weekOf: '2026-02-23', members: {
    'Owen Shaw': { hours: 9.04, orders: 29 },
    'Emma Swenson': { hours: 10.73, orders: 35 },
    'Warner Neuenschwander': { hours: 2.21, orders: 7 },
    'Izabella DePrima': { hours: 39.99, orders: 18 }
  } },
  { weekOf: '2026-03-02', members: {
    'Owen Shaw': { hours: 20.24, orders: 90 },
    'Emma Swenson': { hours: 4.4, orders: 10 },
    'Warner Neuenschwander': { hours: 3.48, orders: 7 },
    'Izabella DePrima': { hours: 39.83, orders: 10 }
  } },
  { weekOf: '2026-03-09', members: {
    'Owen Shaw': { hours: 12.22, orders: 35 },
    'Emma Swenson': { hours: 7.02, orders: 18 },
    'Warner Neuenschwander': { hours: 0, orders: 0 },
    'Izabella DePrima': { hours: 28.76, orders: 3 }
  } },
  { weekOf: '2026-03-16', members: {
    'Owen Shaw': { hours: 23.19, orders: 67 },
    'Emma Swenson': { hours: 2.44, orders: 10 },
    'Warner Neuenschwander': { hours: 0, orders: 0 },
    'Izabella DePrima': { hours: 36.95, orders: 6 }
  } },
  { weekOf: '2026-03-23', members: {
    'Owen Shaw': { hours: 16.06, orders: 30 },
    'Emma Swenson': { hours: 6.25, orders: 26 },
    'Warner Neuenschwander': { hours: 0, orders: 0 },
    'Izabella DePrima': { hours: 37.66, orders: 14 }
  } },
  { weekOf: '2026-03-30', members: {
    'Owen Shaw': { hours: 26.25, orders: 78 },
    'Emma Swenson': { hours: 2.04, orders: 0 },
    'Warner Neuenschwander': { hours: 0, orders: 0 },
    'Izabella DePrima': { hours: 31.54, orders: 22 }
  } },
],
  design: [
  { weekOf: '2025-12-29', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 8.15, orders: 6 },
    'Sloane James': { hours: 0, orders: 0 },
    'Mia Legas': { hours: 2.91, orders: 3 },
    'Sarah Glissmeyer': { hours: 4.79, orders: 3 },
    'Jennika Merrill': { hours: 0, orders: 0 },
    'Audrey Brown': { hours: 0, orders: 0 },
    'Deanna L Brown': { hours: 15.2, orders: 9 }
  } },
  { weekOf: '2026-01-05', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 22.5, orders: 14 },
    'Sloane James': { hours: 6.22, orders: 0 },
    'Mia Legas': { hours: 13.75, orders: 9 },
    'Sarah Glissmeyer': { hours: 14.82, orders: 4 },
    'Jennika Merrill': { hours: 0, orders: 3 },
    'Audrey Brown': { hours: 0, orders: 0 },
    'Deanna L Brown': { hours: 18.94, orders: 10 }
  } },
  { weekOf: '2026-01-12', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 21.73, orders: 15 },
    'Sloane James': { hours: 0, orders: 0 },
    'Mia Legas': { hours: 16.2, orders: 11 },
    'Sarah Glissmeyer': { hours: 13.95, orders: 0 },
    'Jennika Merrill': { hours: 0, orders: 3 },
    'Audrey Brown': { hours: 0, orders: 0 },
    'Deanna L Brown': { hours: 26.29, orders: 12 }
  } },
  { weekOf: '2026-01-19', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 21.86, orders: 14 },
    'Sloane James': { hours: 0, orders: 0 },
    'Mia Legas': { hours: 7.77, orders: 3 },
    'Sarah Glissmeyer': { hours: 18.43, orders: 7 },
    'Jennika Merrill': { hours: 0, orders: 2 },
    'Audrey Brown': { hours: 1.33, orders: 0 },
    'Deanna L Brown': { hours: 27.85, orders: 19 }
  } },
  { weekOf: '2026-01-26', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 0, orders: 0 },
    'Sloane James': { hours: 21.53, orders: 15 },
    'Mia Legas': { hours: 11.26, orders: 15 },
    'Sarah Glissmeyer': { hours: 18.11, orders: 5 },
    'Jennika Merrill': { hours: 0, orders: 22 },
    'Audrey Brown': { hours: 13.64, orders: 10 },
    'Deanna L Brown': { hours: 24.37, orders: 18 }
  } },
  { weekOf: '2026-02-02', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 24.1, orders: 23 },
    'Sloane James': { hours: 0, orders: 0 },
    'Mia Legas': { hours: 18.38, orders: 26 },
    'Sarah Glissmeyer': { hours: 16.66, orders: 9 },
    'Jennika Merrill': { hours: 0, orders: 20 },
    'Audrey Brown': { hours: 11.51, orders: 10 },
    'Deanna L Brown': { hours: 21.31, orders: 12 }
  } },
  { weekOf: '2026-02-09', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 23.33, orders: 15 },
    'Sloane James': { hours: 19.53, orders: 14 },
    'Mia Legas': { hours: 11.07, orders: 14 },
    'Sarah Glissmeyer': { hours: 16.11, orders: 8 },
    'Jennika Merrill': { hours: 0, orders: 12 },
    'Audrey Brown': { hours: 9.32, orders: 3 },
    'Deanna L Brown': { hours: 28.02, orders: 18 }
  } },
  { weekOf: '2026-02-16', members: {
    'Chloe Leonard': { hours: 5.12, orders: 11 },
    'Kathryn Hill': { hours: 19.92, orders: 15 },
    'Sloane James': { hours: 14.91, orders: 11 },
    'Mia Legas': { hours: 20.22, orders: 27 },
    'Sarah Glissmeyer': { hours: 9.86, orders: 0 },
    'Jennika Merrill': { hours: 0, orders: 5 },
    'Audrey Brown': { hours: 5.76, orders: 3 },
    'Deanna L Brown': { hours: 27.3, orders: 25 }
  } },
  { weekOf: '2026-02-23', members: {
    'Chloe Leonard': { hours: 8.17, orders: 4 },
    'Kathryn Hill': { hours: 9.01, orders: 11 },
    'Sloane James': { hours: 23.01, orders: 22 },
    'Mia Legas': { hours: 6.27, orders: 6 },
    'Sarah Glissmeyer': { hours: 0, orders: 0 },
    'Jennika Merrill': { hours: 0, orders: 10 },
    'Audrey Brown': { hours: 9.06, orders: 12 },
    'Deanna L Brown': { hours: 27.3, orders: 26 }
  } },
  { weekOf: '2026-03-02', members: {
    'Chloe Leonard': { hours: 7.6, orders: 9 },
    'Kathryn Hill': { hours: 13.87, orders: 7 },
    'Sloane James': { hours: 16.57, orders: 16 },
    'Mia Legas': { hours: 0, orders: 0 },
    'Sarah Glissmeyer': { hours: 9.41, orders: 6 },
    'Jennika Merrill': { hours: 0, orders: 14 },
    'Audrey Brown': { hours: 9.62, orders: 7 },
    'Deanna L Brown': { hours: 19.78, orders: 17 }
  } },
  { weekOf: '2026-03-09', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 26.81, orders: 15 },
    'Sloane James': { hours: 20.75, orders: 26 },
    'Mia Legas': { hours: 10.86, orders: 18 },
    'Sarah Glissmeyer': { hours: 15.46, orders: 8 },
    'Jennika Merrill': { hours: 0, orders: 10 },
    'Audrey Brown': { hours: 0, orders: 0 },
    'Deanna L Brown': { hours: 20.25, orders: 19 }
  } },
  { weekOf: '2026-03-16', members: {
    'Chloe Leonard': { hours: 0, orders: 0 },
    'Kathryn Hill': { hours: 4.72, orders: 11 },
    'Sloane James': { hours: 19.85, orders: 20 },
    'Mia Legas': { hours: 18.55, orders: 13 },
    'Sarah Glissmeyer': { hours: 14.76, orders: 9 },
    'Jennika Merrill': { hours: 0, orders: 18 },
    'Audrey Brown': { hours: 8.14, orders: 8 },
    'Deanna L Brown': { hours: 24.64, orders: 21 }
  } },
  { weekOf: '2026-03-23', members: {
    'Chloe Leonard': { hours: 3.9, orders: 4 },
    'Kathryn Hill': { hours: 20.11, orders: 14 },
    'Sloane James': { hours: 19.28, orders: 19 },
    'Mia Legas': { hours: 16.03, orders: 21 },
    'Sarah Glissmeyer': { hours: 16.16, orders: 8 },
    'Jennika Merrill': { hours: 0, orders: 11 },
    'Audrey Brown': { hours: 8.92, orders: 8 },
    'Deanna L Brown': { hours: 23.49, orders: 23 }
  } },
  { weekOf: '2026-03-30', members: {
    'Chloe Leonard': { hours: 4.06, orders: 9 },
    'Kathryn Hill': { hours: 20.19, orders: 12 },
    'Sloane James': { hours: 20.18, orders: 24 },
    'Mia Legas': { hours: 18.56, orders: 18 },
    'Sarah Glissmeyer': { hours: 17.18, orders: 8 },
    'Jennika Merrill': { hours: 0, orders: 15 },
    'Audrey Brown': { hours: 7.39, orders: 8 },
    'Deanna L Brown': { hours: 19.06, orders: 18 }
  } },
],
  preservation: [
  { weekOf: '2025-12-29', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 20.22, orders: 24 }
  } },
  { weekOf: '2026-01-05', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 29.68, orders: 20 }
  } },
  { weekOf: '2026-01-12', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 21.16, orders: 16 }
  } },
  { weekOf: '2026-01-19', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 13.52, orders: 21 }
  } },
  { weekOf: '2026-01-26', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 9.1, orders: 12 }
  } },
  { weekOf: '2026-02-02', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 8.44, orders: 10 }
  } },
  { weekOf: '2026-02-09', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 15.15, orders: 25 }
  } },
  { weekOf: '2026-02-16', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 15.55, orders: 27 }
  } },
  { weekOf: '2026-02-23', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 15.88, orders: 24 }
  } },
  { weekOf: '2026-03-02', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 10.88, orders: 11 }
  } },
  { weekOf: '2026-03-09', members: {
    'Emma Dunakey': { hours: 10.69, orders: 19 },
    'Katelyn Wilson': { hours: 0, orders: 0 }
  } },
  { weekOf: '2026-03-16', members: {
    'Emma Dunakey': { hours: 0, orders: 0 },
    'Katelyn Wilson': { hours: 25.37, orders: 46 }
  } },
  { weekOf: '2026-03-23', members: {
    'Emma Dunakey': { hours: 1.14, orders: 5 },
    'Katelyn Wilson': { hours: 21.87, orders: 33 }
  } },
  { weekOf: '2026-03-30', members: {
    'Emma Dunakey': { hours: 7.75, orders: 15 },
    'Katelyn Wilson': { hours: 17.33, orders: 22 }
  } },
],
};

// ─── CSV historical data — Utah (pre-loaded from spreadsheet) ────────────────
const UTAH_HISTORICALS: Record<string, Record<string, { hours: number; orders: number }>> = {
  fulfillment: {
    'Izabella DePrima':      { hours: 2.59+40.06+33.20+39.95+28.11+6.53+39.60+38.67+39.99+39.83+28.76+36.95+37.66+31.54, orders: 10+8+21+12+22+26+18+10+3+6+14+22 },
    'Warner Neuenschwander': { hours: 3.73+5.73+1.12+2.07+7.17+7.21+3.86+2.21+3.48, orders: 16+18+8+5+13+9+23+7+7 },
    'Owen Shaw':             { hours: 6.25+10.41+19.80+14.12+13.85+7.41+22.71+17.19+9.04+20.24+12.22+23.19+16.06+26.25, orders: 15+23+44+40+31+21+55+55+29+90+35+67+30+78 },
    'Emma Swenson':          { hours: 9.77+6.67+12.09+6.10+6.86+4.65+6.43+10.73+4.40+7.02+2.44+6.25+2.04, orders: 21+25+31+17+15+9+14+35+10+18+10+26 },
  },
  design: {
    'Deanna L Brown':   { hours: 15.20+18.94+26.29+27.85+24.37+21.31+28.02+27.30+27.30+19.78+20.25+24.64+23.49+19.06, orders: 9+10+12+19+18+12+18+25+26+17+19+21+23+18 },
    'Sarah Glissmeyer': { hours: 4.79+14.82+13.95+18.43+18.11+16.66+16.11+9.86+9.41+15.46+14.76+16.16+17.18, orders: 3+4+0+7+5+9+8+6+8+9+8+8 },
    'Kathryn Hill':     { hours: 8.15+22.50+21.73+21.86+24.10+23.33+19.92+9.01+13.87+26.81+4.72+20.11+20.19, orders: 6+14+15+14+23+15+15+11+7+15+11+14+12 },
    'Mia Legas':        { hours: 2.91+13.75+16.20+7.77+11.26+18.38+11.07+20.22+6.27+10.86+18.55+16.03+18.56, orders: 3+9+11+3+15+26+14+27+6+18+13+21+18 },
    'Sloane James':     { hours: 6.22+21.53+19.53+14.91+23.01+16.57+20.75+19.85+19.28+20.18, orders: 15+14+11+22+16+26+20+19+24 },
    'Audrey Brown':     { hours: 1.33+13.64+11.51+9.32+5.76+9.06+9.62+8.14+8.92+7.39, orders: 10+10+3+3+12+7+8+8+8 },
    'Chloe Leonard':    { hours: 5.12+8.17+7.60+3.90+4.06, orders: 11+4+9+4+9 },
    'Jennika Merrill':  { hours: 0, orders: 3+3+2+22+20+12+5+10+14+10+18+11+15 },
  },
  preservation: {
    'Katelyn Wilson':  { hours: 20.22+29.68+21.16+13.52+9.10+8.44+15.15+15.55+15.88+10.88+25.37+21.87+17.33, orders: 24+20+16+21+12+10+25+27+24+11+46+33+22 },
    'Emma Dunakey':    { hours: 10.69+1.14+7.75, orders: 19+5+15 },
  },
};

// ─── DeptHistoricalsTab ────────────────────────────────────────────────────────
function DeptHistoricalsTab({ department, location, teamMembers, teamActuals, onActualsSaved, showReceivedField, ordersLabel, onPresActualsSaved }: {
  department:          'preservation' | 'fulfillment' | 'design';
  location:            'Utah' | 'Georgia';
  teamMembers:         string[];
  teamActuals:         { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:      () => void;
  showReceivedField:   boolean;
  ordersLabel:         string;
  onPresActualsSaved?: (weekOf: string, received: number) => void;
}) {
  const HIST_WEEKS  = 20;
  const weekOptions = pastWeeks(HIST_WEEKS);
  const [saving,    setSaving]  = useState(false);
  const [saveMsg,   setSaveMsg] = useState('');
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, { hours: number; orders: number }>>>({});
  const [totalReceived, setTotalReceived] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);

  // YTD totals from CSV for Utah — shown as reference
  const ytdData = location === 'Utah' ? (UTAH_HISTORICALS[department] ?? {}) : {};

  // Seed per-week CSV data into Supabase on first load if no actuals exist yet
  useEffect(() => {
    if (seeded.current || location !== 'Utah') return;
    const existing = teamActuals.filter(r => r.department === department);
    if (existing.length > 0) { seeded.current = true; return; }
    const weeklyData = UTAH_HISTORICALS_BY_WEEK[department];
    if (!weeklyData || weeklyData.length === 0) return;
    seeded.current = true;
    const posts: Promise<unknown>[] = [];
    weeklyData.forEach(({ weekOf, members }) => {
      Object.entries(members).forEach(([name, d]) => {
        if (d.hours === 0 && d.orders === 0) return;
        posts.push(fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'team', location, weekOf, department, memberName: name, actualHours: d.hours, actualOrders: d.orders }),
        }));
      });
    });
    Promise.all(posts).then(() => onActualsSaved()).catch(() => {});
  }, [teamActuals, department, location]); // eslint-disable-line react-hooks/exhaustive-deps

  function getEntry(weekOf: string, name: string) {
    if (localEdits[weekOf]?.[name]) return localEdits[weekOf][name];
    const row = teamActuals.find(r => r.department === department && r.week_of === weekOf && r.member_name === name);
    return { hours: row?.actual_hours ?? 0, orders: row?.actual_orders ?? 0 };
  }

  function setEntry(weekOf: string, name: string, field: 'hours' | 'orders', val: number) {
    setLocalEdits(prev => ({
      ...prev,
      [weekOf]: { ...(prev[weekOf] ?? {}), [name]: { ...getEntry(weekOf, name), [field]: val } },
    }));
    // Auto-save with debounce
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const entry = { ...getEntry(weekOf, name), [field]: val };
        await fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'team', location, weekOf, department, memberName: name, actualHours: entry.hours, actualOrders: entry.orders }),
        });
        setSaveMsg('✓');
        onActualsSaved();
        setTimeout(() => setSaveMsg(''), 1500);
      } catch { setSaveMsg('Save failed'); }
      setSaving(false);
    }, 800);
  }

  // Weeks with any data (from Supabase or local edits)
  const weeksWithData = new Set([
    ...teamActuals.filter(r => r.department === department).map(r => r.week_of),
    ...Object.keys(localEdits),
  ]);

  // All weeks to show: past 20 weeks, sorted newest first
  const displayWeeks = [...weekOptions].reverse(); // oldest left, newest right — scroll right for recent


  // YTD totals computed from Supabase actuals + CSV seed data
  const ytdTotals = useMemo(() => {
    const map: Record<string, { hours: number; orders: number }> = {};
    teamActuals.filter(r => r.department === department).forEach(r => {
      if (!map[r.member_name]) map[r.member_name] = { hours: 0, orders: 0 };
      map[r.member_name].hours  += r.actual_hours;
      map[r.member_name].orders += r.actual_orders;
    });
    Object.entries(ytdData).forEach(([name, d]) => {
      if (!map[name]) map[name] = { hours: 0, orders: 0 };
      if (map[name].orders === 0) { map[name].hours = d.hours; map[name].orders = d.orders; }
    });
    return map;
  }, [teamActuals, department, ytdData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Historicals — {department} · {location}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Edit any cell — saves automatically. Shows last {displayWeeks.length} weeks.</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-slate-400 italic">Saving…</span>}
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
        </div>
      </div>

      {/* YTD summary */}
      {Object.keys(ytdTotals).length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Year-to-date totals</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-1.5 text-left font-medium text-slate-400">Team member</th>
                  <th className="px-3 py-1.5 text-center font-medium text-slate-400">Total {ordersLabel}</th>
                  <th className="px-3 py-1.5 text-center font-medium text-slate-400">Total hours</th>
                  <th className="px-3 py-1.5 text-center font-medium text-slate-400">YTD ratio</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((name, i) => {
                  const d = ytdTotals[name];
                  if (!d || (d.hours === 0 && d.orders === 0)) return null;
                  const ratio = d.hours > 0 && d.orders > 0 ? d.hours / d.orders : null;
                  return (
                    <tr key={name} className={i % 2 === 0 ? '' : 'bg-slate-50/40'}>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{name}</td>
                      <td className="px-3 py-1.5 text-center text-indigo-700 font-semibold">{Math.round(d.orders)}</td>
                      <td className="px-3 py-1.5 text-center text-slate-500">{Math.round(d.hours)}h</td>
                      <td className="px-3 py-1.5 text-center">
                        {ratio !== null ? (
                          <span className={`font-semibold ${ratio <= 0.7 ? 'text-green-700' : ratio <= 1.5 ? 'text-amber-700' : 'text-red-700'}`}>
                            {ratio.toFixed(2)} h/ord
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All weeks inline-editable grid */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">All weeks overview</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click any number to edit. Top = {ordersLabel}, bottom = hours. Saves automatically.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[140px]">Team member</th>
                {displayWeeks.map(w => (
                  <th key={w} className="px-2 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[80px]">
                    {fmtDate(w).split(',')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((name, ni) => (
                <tr key={name} className={ni % 2 === 0 ? '' : 'bg-slate-50/40'}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{name}</td>
                  {displayWeeks.map(w => {
                    const entry = getEntry(w, name);
                    const ratio = entry.hours > 0 && entry.orders > 0 ? entry.hours / entry.orders : null;
                    const hasData = entry.hours > 0 || entry.orders > 0;
                    return (
                      <td key={w} className={`px-1 py-1 text-center ${hasData ? '' : 'opacity-30'}`}>
                        <div className="flex flex-col gap-0.5 items-center">
                          <input type="number" min="0" value={entry.orders || ''}
                            placeholder="0" title="Orders"
                            onChange={e => setEntry(w, name, 'orders', parseInt(e.target.value) || 0)}
                            className="w-12 border border-slate-200 rounded px-1 py-0.5 text-center text-indigo-700 font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                          <input type="number" min="0" step="0.5" value={entry.hours || ''}
                            placeholder="0h" title="Hours"
                            onChange={e => setEntry(w, name, 'hours', parseFloat(e.target.value) || 0)}
                            className="w-12 border border-slate-200 rounded px-1 py-0.5 text-center text-slate-400 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                          {ratio !== null && (
                            <span className={`text-[9px] font-medium ${ratio <= 0.7 ? 'text-green-700' : ratio <= 1.5 ? 'text-amber-700' : 'text-red-600'}`}>
                              {ratio.toFixed(2)}
                            </span>
                          )}
                        </div>
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
  );
}

// ─── PreservationSection ───────────────────────────────────────────────────────

// ─── useDraggableOrder ────────────────────────────────────────────────────────
function useDraggableOrder<T extends { id: string }>(
  items: T[],
  onReorder: (newOrder: string[]) => void
) {
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  function handleDragStart(id: string) { dragId.current = id; }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function handleDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) { setDragOverId(null); return; }
    const ids = items.map(i => i.id);
    const fromIdx = ids.indexOf(dragId.current);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragOverId(null); return; }
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId.current);
    dragId.current = null;
    setDragOverId(null);
    onReorder(next);
  }
  function handleDragEnd() { dragId.current = null; setDragOverId(null); }
  return { dragOverId, handleDragStart, handleDragOver, handleDrop, handleDragEnd };
}

// ─── PresRosterEditor ─────────────────────────────────────────────────────────
function PresRosterEditor({ team, presRoster, onUpdateRoster, onRemove, onReorder }: {
  team: PresTeamMember[];
  presRoster: Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number; role?: string }>;
  onUpdateRoster: (id: string, field: 'ratio' | 'rate' | 'name' | 'payType' | 'annualSalary' | 'role', val: string | number) => void;
  onRemove: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  onRefreshRatio: (id: string, name: string) => void;
}) {
  const { dragOverId, handleDragStart, handleDragOver, handleDrop, handleDragEnd } =
    useDraggableOrder(team, onReorder);
  return (
    <div>
      <div className="grid grid-cols-[16px_1fr_80px_70px_80px_110px_120px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
        <span /><span>Name</span><span className="text-center">Role</span><span className="text-center">Ratio</span><span className="text-center">Pay type</span><span className="text-center">Hourly rate</span><span className="text-center">Annual salary</span><span />
      </div>
      <div className="space-y-2">
        {team.map((m) => (
          <div key={m.id}
            className={`grid grid-cols-[16px_1fr_80px_70px_80px_110px_120px_20px] gap-2 items-center rounded transition-colors ${dragOverId === m.id ? 'bg-indigo-50' : ''}`}
            onDragOver={e => handleDragOver(e, m.id)}
            onDrop={() => handleDrop(m.id)}>
            <span
              draggable
              onDragStart={e => { e.stopPropagation(); handleDragStart(m.id); }}
              onDragEnd={handleDragEnd}
              className="text-slate-300 cursor-grab active:cursor-grabbing text-center select-none px-1">⠿</span>
            <input type="text" value={m.name}
              onChange={e => onUpdateRoster(m.id, 'name', e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <select value={m.role ?? 'specialist'} onChange={e => onUpdateRoster(m.id, 'role', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="specialist">Specialist</option>
              <option value="senior">Senior</option>
              <option value="master">Master</option>
            </select>
            <div className="flex items-center gap-1">
              <input type="number" value={m.ratio} step="0.05" min="0.05"
                onChange={e => onUpdateRoster(m.id, 'ratio', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={() => onRefreshRatio(m.id, m.name)} title="Update from last 4 weeks"
                className="text-slate-300 hover:text-indigo-500 transition-colors text-sm shrink-0">↻</button>
            </div>
            <select value={m.payType ?? 'hourly'} onChange={e => onUpdateRoster(m.id, 'payType', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={m.rate || ''} step="0.50" min="0" placeholder="0"
                disabled={m.payType === 'salary'}
                onChange={e => onUpdateRoster(m.id, 'rate', parseFloat(e.target.value) || 0)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={m.annualSalary || ''} step="1000" min="0" placeholder="e.g. 40000"
                disabled={m.payType !== 'salary'}
                onChange={e => onUpdateRoster(m.id, 'annualSalary', parseFloat(e.target.value) || 0)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <button onClick={() => onRemove(m.id)}
              className="text-slate-300 hover:text-red-400 transition-colors text-xl leading-none text-center">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FfRosterEditor ────────────────────────────────────────────────────────────
function FfRosterEditor({ team, ffRoster, onUpdateName, onUpdateRoster, onRemove, onReorder }: {
  team: FfTeamMember[];
  ffRoster: Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number }>;
  onUpdateName: (id: string, name: string) => void;
  onUpdateRoster: (mi: number, field: 'ratio' | 'rate' | 'payType' | 'annualSalary' | 'role', val: number | string) => void;
  onRemove: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
}) {
  const { dragOverId, handleDragStart, handleDragOver, handleDrop, handleDragEnd } =
    useDraggableOrder(team, onReorder);
  return (
    <div>
      <div className="grid grid-cols-[16px_1fr_80px_70px_80px_110px_120px_20px] gap-2 mb-2 px-1 text-xs font-medium text-slate-400">
        <span /><span>Name</span><span className="text-center">Role</span><span className="text-center">Ratio</span><span className="text-center">Pay type</span><span className="text-center">Hourly rate</span><span className="text-center">Annual salary</span><span />
      </div>
      <div className="space-y-2">
        {team.map((m, mi) => (
          <div key={m.id}
            className={`grid grid-cols-[16px_1fr_80px_70px_80px_110px_120px_20px] gap-2 items-center rounded transition-colors ${dragOverId === m.id ? 'bg-indigo-50' : ''}`}
            onDragOver={e => handleDragOver(e, m.id)}
            onDrop={() => handleDrop(m.id)}>
            <span
              draggable
              onDragStart={e => { e.stopPropagation(); handleDragStart(m.id); }}
              onDragEnd={handleDragEnd}
              className="text-slate-300 cursor-grab active:cursor-grabbing text-center select-none px-1">⠿</span>
            <input type="text" value={m.name}
              onChange={e => onUpdateName(m.id, e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <select value={m.role ?? 'specialist'} onChange={e => onUpdateRoster(mi, 'role', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="specialist">Specialist</option>
              <option value="senior">Senior</option>
              <option value="master">Master</option>
            </select>
            <div className="flex items-center gap-1">
              <input type="number" value={m.ratio} step="0.05" min="0.05"
                onChange={e => onUpdateRoster(mi, 'ratio', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={() => onRefreshRatio(m.id, m.name)} title="Update from last 4 weeks"
                className="text-slate-300 hover:text-indigo-500 transition-colors text-sm shrink-0">↻</button>
            </div>
            <select value={m.payType ?? 'hourly'} onChange={e => onUpdateRoster(mi, 'payType', e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={m.rate || ''} step="0.50" min="0" placeholder="0"
                disabled={m.payType === 'salary'}
                onChange={e => onUpdateRoster(mi, 'rate', parseFloat(e.target.value) || 0)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
              <input type="number" value={m.annualSalary || ''} step="1000" min="0" placeholder="e.g. 40000"
                disabled={m.payType !== 'salary'}
                onChange={e => onUpdateRoster(mi, 'annualSalary', parseFloat(e.target.value) || 0)}
                className="w-full pl-5 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-30 disabled:bg-slate-50" />
            </div>
            <button onClick={() => onRemove(m.id)}
              className="text-slate-300 hover:text-red-400 transition-colors text-xl leading-none text-center">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreservationSection({ location, preservationQueue, countsLoading, teamActuals, onActualsSaved,
  presHours, presRoster, presSettings, mgrTotalHours, onPresHoursChange, onPresRosterChange, onPresSettingsChange, onMgrTotalHoursChange }: {
  location:              'Utah' | 'Georgia';
  preservationQueue:     number;
  countsLoading:         boolean;
  teamActuals:           { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:        () => void;
  presHours:             Record<string, number[]>;
  presRoster:            Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number }>;
  presSettings:          { dateFrom?: string; dateTo?: string; weekOverrides?: Record<string, { ut: number; ga: number }>; dayPcts?: number[]; dayOverrides?: Record<string, { ut: number; ga: number }> };
  mgrTotalHours:         Record<string, number[]>;
  onPresHoursChange:     (h: Record<string, number[]>) => void;
  onPresRosterChange:    (r: Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number }>) => void;
  onPresSettingsChange:  (s: { dateFrom?: string; dateTo?: string; weekOverrides?: Record<string, { ut: number; ga: number }>; dayPcts?: number[]; dayOverrides?: Record<string, { ut: number; ga: number }> }) => void;
  onMgrTotalHoursChange: (h: Record<string, number[]>) => void;
}) {
  const today    = new Date();
  const monday   = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  const mondayIso = monday.toISOString().split('T')[0];
  const sundayIso = addDays(mondayIso, 6);

  const [presTab,       setPresTab]      = useState<'schedule' | 'historicals'>('schedule');
  const [showRoster,    setShowRoster]   = useState(false);
  const [weekOffset,    setWeekOffset]   = useState(0);
  const [activePresTab, setActivePresTab] = useState<'weekly' | '52week'>('weekly');

  // Date range for the 7-day delivery estimates
  const dateFrom = presSettings.dateFrom ?? mondayIso;
  const dateTo   = presSettings.dateTo   ?? sundayIso;
  const weekOverrides = presSettings.weekOverrides ?? {};
  const dayPcts = presSettings.dayPcts ?? [20, 25, 25, 20, 10];
  const dayOverrides = presSettings.dayOverrides ?? {};
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  function setDayPct(i: number, val: number) {
    const next = [...dayPcts]; next[i] = val;
    onPresSettingsChange({ ...presSettings, dayPcts: next });
  }
  function setDayOverride(iso: string, locKey: 'ut' | 'ga', val: number | null) {
    const next = { ...dayOverrides };
    if (val === null) {
      const existing = next[iso];
      if (existing) {
        next[iso] = { ...existing, [locKey]: 0 };
      }
    } else {
      next[iso] = { ut: next[iso]?.ut ?? 0, ga: next[iso]?.ga ?? 0, [locKey]: val };
    }
    onPresSettingsChange({ ...presSettings, dayOverrides: next });
  }

  function setDateFrom(v: string) { onPresSettingsChange({ ...presSettings, dateFrom: v }); }
  function setDateTo(v: string)   { onPresSettingsChange({ ...presSettings, dateTo: v }); }

  // ── Shopify event-date fetch (replaces parseDateRange mock) ──────────────────
  const [shopifyByDate, setShopifyByDate] = useState<Record<string, { count: number; gaCount: number; utahCount: number }>>({});
  const [shopifyTotal,  setShopifyTotal]  = useState(0);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError,   setShopifyError]   = useState('');

  function loadRange(from: string, to: string) {
    setShopifyLoading(true);
    setShopifyError('');
    fetch(`/api/event-date-orders?start=${from}&end=${to}`)
      .then(r => r.json())
      .then((d: { byDate?: Record<string, { count: number; gaCount: number; utahCount: number }>; total?: number; error?: string }) => {
        if (d.error) { setShopifyError(d.error); return; }
        setShopifyByDate(d.byDate ?? {});
        setShopifyTotal(d.total ?? 0);
      })
      .catch(e => setShopifyError(String(e)))
      .finally(() => setShopifyLoading(false));
  }

  // Load on mount and when date range changes
  useEffect(() => { loadRange(dateFrom, dateTo); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Total Utah/Georgia from loaded Shopify range
  const totalUtahLoaded = Object.values(shopifyByDate).reduce((s, d) => s + d.utahCount, 0);
  const totalGaLoaded   = Object.values(shopifyByDate).reduce((s, d) => s + d.gaCount,   0);

  // Build 5 weekdays starting from the loaded dateFrom
  const fiveDays = (() => {
    const days: { iso: string; utahEst: number; gaEst: number; utahDefault: number; gaDefault: number; label: string; dateStr: string }[] = [];
    const d = new Date((dateFrom || new Date().toISOString().split('T')[0]) + 'T12:00:00');
    let dayIdx = 0;
    while (days.length < 5) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        const iso = d.toISOString().split('T')[0];
        const pct = (dayPcts[dayIdx] ?? 0) / 100;
        const utahDefault = Math.round(totalUtahLoaded * pct);
        const gaDefault   = Math.round(totalGaLoaded   * pct);
        const override    = dayOverrides[iso];
        days.push({
          iso,
          utahEst:     override?.ut !== undefined ? override.ut : utahDefault,
          gaEst:       override?.ga !== undefined ? override.ga : gaDefault,
          utahDefault,
          gaDefault,
          label:   d.toLocaleDateString('en-US', { weekday: 'short' }),
          dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
        dayIdx++;
      }
      d.setDate(d.getDate() + 1);
    }
    return days;
  })();

  // Compute per-WEEK Shopify-derived estimates for the 52-week grid
  // For each future week, sum event-date orders by ga tag within that Mon–Sun window
  // (We fetch on demand when user loads a range; for 52-week we use the overrides + a simple sum)
  const [weeklyShopify, setWeeklyShopify] = useState<Record<string, { ut: number; ga: number }>>({});
  const [weeklyShopifyLoading, setWeeklyShopifyLoading] = useState(false);

  function loadWeeklyShopify() {
    // Fetch next 52 weeks of event-date data all at once
    const from = isoMonday(0);
    const to   = addDays(isoMonday(51), 6);
    setWeeklyShopifyLoading(true);
    fetch(`/api/event-date-orders?start=${from}&end=${to}`)
      .then(r => r.json())
      .then((d: { byDate?: Record<string, { count: number; gaCount: number; utahCount: number }>; error?: string }) => {
        if (d.error || !d.byDate) return;
        // Bucket each date into its Mon–Sun week
        const map: Record<string, { ut: number; ga: number }> = {};
        Object.entries(d.byDate).forEach(([dateIso, counts]) => {
          const date = new Date(dateIso + 'T12:00:00');
          const dow = date.getDay();
          const diff = dow === 0 ? -6 : 1 - dow;
          const mon = new Date(date); mon.setDate(date.getDate() + diff);
          const weekKey = mon.toISOString().split('T')[0];
          if (!map[weekKey]) map[weekKey] = { ut: 0, ga: 0 };
          map[weekKey].ut += counts.utahCount;
          map[weekKey].ga += counts.gaCount;
        });
        setWeeklyShopify(map);
      })
      .catch(() => {})
      .finally(() => setWeeklyShopifyLoading(false));
  }

  // Merge persisted roster + hours over defaults
  const defaultTeam = location === 'Utah' ? UTAH_PRESERVATION_TEAM : GEORGIA_PRESERVATION_TEAM;

  // Build team including any added members from presRoster that aren't in defaultTeam
  const team: PresTeamMember[] = (() => {
    const base = defaultTeam.map(m => {
      const roster = presRoster[m.id];
      const hours  = presHours[m.id] ?? Array(WEEKS).fill(m.hours[0] ?? 0);
      return { ...m, ratio: roster?.ratio ?? m.ratio, rate: roster?.rate ?? m.rate, hours };
    });
    // Add any custom members stored in presRoster not in defaultTeam
    const defaultIds = new Set(defaultTeam.map(m => m.id));
    Object.entries(presRoster).forEach(([id, r]) => {
      if (!defaultIds.has(id)) {
        base.push({
          id, name: r.name, ratio: r.ratio, rate: r.rate,
          pay: 'hourly' as const,
          payType: (r.payType ?? 'hourly') as 'hourly' | 'salary',
          annualSalary: r.annualSalary ?? 0,
          hours: presHours[id] ?? Array(WEEKS).fill(0),
        } as PresTeamMember);
      }
    });
    return base;
  })();

  function updateHours(memberId: string, weekIdx: number, val: number) {
    const newHours = { ...presHours, [memberId]: [...(presHours[memberId] ?? Array(WEEKS).fill(0))] };
    newHours[memberId][weekIdx] = val;
    onPresHoursChange(newHours);
  }

  function applyToAllWeeks(memberId: string, hours: number) {
    const newHours = { ...presHours, [memberId]: Array(WEEKS).fill(hours) };
    onPresHoursChange(newHours);
  }

  function updateRoster(memberId: string, field: 'ratio' | 'rate' | 'name' | 'payType' | 'annualSalary' | 'role', val: string | number) {
    const existing = presRoster[memberId] ?? { ratio: 1, rate: 0, name: 'Team Member', payType: 'hourly' as const, annualSalary: 0 };
    onPresRosterChange({ ...presRoster, [memberId]: { ...existing, [field]: val } });
  }

  function handleAddMember() {
    const id = `${location.toLowerCase()}-p-${Date.now()}`;
    onPresRosterChange({ ...presRoster, [id]: { id, name: 'New Member', ratio: 0.7, rate: 0 } as typeof presRoster[string] });
    onPresHoursChange({ ...presHours, [id]: Array(WEEKS).fill(0) });
  }

  function handleRemoveMember(id: string) {
    const newRoster = { ...presRoster };
    delete newRoster[id];
    const newHours = { ...presHours };
    delete newHours[id];
    onPresRosterChange(newRoster);
    onPresHoursChange(newHours);
    // Also clear from defaultTeam overrides if needed — id is always reliable
  }

  // Per-day hours (index 0–4 = Mon–Fri of current week)
  const dayTotals = Array.from({ length: 5 }, (_, di) =>
    team.reduce((s, m) => s + (m.ratio > 0 ? Math.round((m.hours[di] ?? 0) / m.ratio) : 0), 0)
  );

  // Per-week totals for 52-week grid
  const weeklyTotals = Array.from({ length: WEEKS }, (_, w) =>
    team.reduce((s, m) => s + (m.ratio > 0 ? Math.round((m.hours[w] ?? 0) / m.ratio) : 0), 0)
  );

  const windowWeeks = Array.from({ length: WINDOW }, (_, i) => i + weekOffset).filter(i => i < WEEKS);
  const hasRates = team.some(m => m.rate > 0);

  const tagStyle: Record<string, string> = {
    hourly: 'bg-slate-100 text-slate-600',
    flex:   'bg-indigo-100 text-indigo-700',
    oncall: 'bg-pink-100 text-pink-700',
  };

  const locKey = location === 'Utah' ? 'ut' : 'ga';

  return (
    <div className="space-y-4">

      {/* Tabs: Schedule | Historicals */}
      <div className="flex border-b border-slate-200">
        {(['schedule', 'historicals'] as const).map(t => (
          <button key={t} onClick={() => setPresTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              presTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>{t === 'schedule' ? 'Schedule' : 'Historicals'}</button>
        ))}
      </div>

      {/* ── SCHEDULE TAB ── */}
      {presTab === 'schedule' && (
        <div className="space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Preservation queue</p>
              <p className="text-xs text-slate-400 mb-2">Bouquet Received → In Progress</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-green-700">{countsLoading ? '…' : preservationQueue.toLocaleString()}</p>
                <span className="text-[10px] bg-green-100 text-green-600 rounded px-1.5 py-0.5">live</span>
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">This week capacity</p>
              <p className="text-xs text-slate-400 mb-2">orders processable</p>
              <p className="text-xl font-semibold text-slate-900">{weeklyTotals[0]} <span className="text-sm font-normal text-slate-400">orders</span></p>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Event-date orders loaded</p>
              <p className="text-xs text-slate-400 mb-2">{dateFrom} → {dateTo}</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-rose-700">{shopifyLoading ? '…' : shopifyTotal}</p>
                {shopifyTotal > 0 && <span className="text-[10px] bg-rose-100 text-rose-600 rounded px-1.5 py-0.5">live</span>}
              </div>
            </div>
          </div>

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
              <button onClick={() => loadRange(dateFrom, dateTo)} disabled={shopifyLoading}
                className="px-4 py-1.5 text-xs font-medium bg-rose-700 text-white rounded hover:bg-rose-800 disabled:opacity-50 transition-colors">
                {shopifyLoading ? 'Loading…' : 'Load'}
              </button>
              {shopifyError && <span className="text-xs text-red-500">{shopifyError}</span>}
            </div>
            {shopifyTotal > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-6 flex-wrap">
                <div><p className="text-xs text-slate-400">Total</p><p className="text-lg font-semibold text-slate-700">{shopifyTotal}</p></div>
                <div><p className="text-xs text-slate-400">Utah (no ga tag)</p><p className="text-lg font-semibold text-indigo-700">{Object.values(shopifyByDate).reduce((s,d)=>s+d.utahCount,0)}</p></div>
                <div><p className="text-xs text-slate-400">Georgia (ga tag)</p><p className="text-lg font-semibold text-indigo-700">{Object.values(shopifyByDate).reduce((s,d)=>s+d.gaCount,0)}</p></div>
              </div>
            )}
          </div>

          {/* Day % distribution + 5-day editable grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Arrival % by day of week</h3>
              <p className="text-xs text-slate-400 mb-3">% of orders arriving each day. Should total 100%.</p>
              <div className="space-y-2">
                {dayNames.map((name, i) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-20">{name}</span>
                    <input type="number" value={dayPcts[i]} min="0" max="100"
                      onChange={e => setDayPct(i, parseFloat(e.target.value) || 0)}
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
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Est. deliveries — {location}</h3>
              <p className="text-xs text-slate-400 mb-3">
                {shopifyTotal > 0
                  ? `${location === 'Utah' ? totalUtahLoaded : totalGaLoaded} ${location} orders in range · edit any day to override`
                  : 'Load an event date range above first.'}
              </p>
              <div className="space-y-2">
                {fiveDays.map((d) => {
                  const locKey = location === 'Utah' ? 'ut' : 'ga';
                  const def = location === 'Utah' ? d.utahDefault : d.gaDefault;
                  const est = location === 'Utah' ? d.utahEst     : d.gaEst;
                  const isOverridden = dayOverrides[d.iso]?.[locKey] !== undefined;
                  return (
                    <div key={d.iso} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-24">{d.label} <span className="text-slate-300 text-[10px]">{d.dateStr}</span></span>
                      <input
                        type="number" min="0"
                        value={est}
                        onChange={e => setDayOverride(d.iso, locKey, parseInt(e.target.value) || 0)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-sm text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      {isOverridden && (
                        <span className="text-[10px] text-slate-300">def: {def}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Roster editor */}
          <div>
            <button onClick={() => setShowRoster(r => !r)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              {showRoster ? '▲ Hide' : '▼ Edit'} preservation roster, ratios &amp; pay rates
            </button>
            {showRoster && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-5">
                <PresRosterEditor
                  team={team}
                  presRoster={presRoster}
                  onUpdateRoster={updateRoster}
                  onRemove={handleRemoveMember}
                  onRefreshRatio={async (id, name) => {
                    try {
                      const res = await fetch(`/api/actuals?location=${location}&type=team&weeks=100`);
                      const data = await res.json() as { teamActuals?: { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[] };
                      const rows = (data.teamActuals ?? []).filter(r => r.department === 'preservation' && r.member_name === name).sort((a, b) => b.week_of.localeCompare(a.week_of)).slice(0, 4);
                      const h = rows.reduce((s, r) => s + r.actual_hours, 0);
                      const o = rows.reduce((s, r) => s + r.actual_orders, 0);
                      if (o > 0 && h > 0) updateRoster(id, 'ratio', Math.round(h / o * 100) / 100);
                    } catch {}
                  }}
                  onReorder={(newOrder) => {
                    const newRoster = { ...presRoster };
                    newOrder.forEach((id, i) => {
                      newRoster[id] = { ...(newRoster[id] ?? { ratio: 1, rate: 0, name: '' }), _order: i } as typeof newRoster[string];
                    });
                    onPresRosterChange(newRoster);
                  }}
                />
                <button onClick={handleAddMember}
                  className="mt-4 text-xs px-3 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 transition-colors">
                  + Add team member
                </button>
                <p className="mt-3 text-xs text-slate-400"><strong>Ratio:</strong> hours per order. e.g. 0.7 = 1 order takes 0.7 hrs.</p>
              </div>
            )}
          </div>

          {/* Weekly / 52-week toggle */}
          <div className="flex gap-1">
            {(['weekly', '52week'] as const).map(t => (
              <button key={t} onClick={() => { setActivePresTab(t); if (t === '52week' && Object.keys(weeklyShopify).length === 0) loadWeeklyShopify(); }}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activePresTab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {t === 'weekly' ? 'This week' : '52-week planner'}
              </button>
            ))}
          </div>

          {/* ── THIS WEEK VIEW ── */}
          {activePresTab === 'weekly' && (
            <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Hours per team member — this week</h3>
                {hasRates && <span className="text-xs text-slate-400">CPO shown when rate is set</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 min-w-[140px]">Team member</th>
                      {fiveDays.map((d, i) => (
                        <th key={i} className={`px-2 py-2 text-center font-medium min-w-[80px] whitespace-nowrap ${i === 0 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}>
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
                            <span className={`ml-1.5 text-[10px] rounded px-1 py-px ${tagStyle[m.pay] ?? 'bg-slate-100 text-slate-600'}`}>{m.pay}</span>
                          </div>
                        </td>
                        {fiveDays.map((_, di) => {
                          const prodH = m.hours[di] ?? 0;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? prodH) : prodH;
                          const orders = m.ratio > 0 ? Math.round(prodH / m.ratio) : 0;
                          const cost = m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate;
                          const cpo = !m.isManager && orders > 0 && cost > 0 ? cost / orders : null;
                          return (
                            <td key={di} className={`px-2 py-1.5 text-center ${di === 0 ? 'bg-indigo-50/30' : ''}`}>
                              <input type="number" value={prodH || ''} placeholder="0" min="0" step="0.5"
                                title={m.isManager ? 'Production hours' : 'Hours'}
                                onChange={e => updateHours(m.id, di, parseFloat(e.target.value) || 0)}
                                className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                              {m.isManager && (
                                <input type="number" value={totalH || ''} placeholder="total" min="0" step="0.5"
                                  title="Total hours (incl. managerial)"
                                  onChange={e => {
                                    const newH = { ...mgrTotalHours, [m.id]: [...(mgrTotalHours[m.id] ?? Array(WEEKS).fill(0))] };
                                    newH[m.id][di] = parseFloat(e.target.value) || 0;
                                    onMgrTotalHoursChange(newH);
                                  }}
                                  className="w-14 mt-0.5 border border-violet-200 rounded px-1.5 py-0.5 text-center text-[10px] text-violet-600 bg-violet-50 focus:outline-none focus:ring-1 focus:ring-violet-300" />
                              )}
                              {orders > 0 && <div className="text-slate-400 mt-0.5">{orders} ord</div>}
                              {cpo !== null && <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Daily capacity</td>
                      {fiveDays.map((d, di) => {
                        const cap = dayTotals[di];
                        const est = location === 'Utah' ? d.utahEst : d.gaEst;
                        const diff = cap - est;
                        const dayCost = team.reduce((s, m) => {
                          const prodH = m.hours[di] ?? 0;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? prodH) : prodH;
                          return s + (m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate);
                        }, 0);
                        const dayCPO = cap > 0 && dayCost > 0 ? dayCost / cap : null;
                        return (
                          <td key={di} className={`px-2 py-2 text-center ${di === 0 ? 'bg-indigo-50/50' : ''}`}>
                            <div className="text-indigo-700">{cap} ord</div>
                            {est > 0 && (
                              <div className={`text-[10px] font-medium ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                {diff > 0 ? '+' : ''}{diff} vs est.
                              </div>
                            )}
                            {dayCPO !== null && <div className="text-[10px] text-amber-600">{fmt$(dayCPO)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="sticky left-0 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">Est. deliveries</td>
                      {fiveDays.map((d, di) => {
                        const est = location === 'Utah' ? d.utahEst : d.gaEst;
                        return <td key={di} className="px-2 py-1.5 text-center text-[10px] text-slate-400">{est || '—'}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 52-WEEK PLANNER ── */}
          {activePresTab === '52week' && (
            <div className="space-y-3">
              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-700">Hours per team member per week</h3>
                    {weeklyShopifyLoading && <span className="text-xs text-slate-400 italic">Loading event data…</span>}
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
                        <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[140px]">Team member</th>
                        {windowWeeks.map(w => (
                          <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px]">
                            {getWeekLabel(w)}
                            {w === 0 && <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded px-1">now</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {team.map((m, mi) => (
                        <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                            <div className="font-medium text-slate-700">{m.name}</div>
                            <div className="text-slate-400">{m.ratio} h/ord</div>
                          </td>
                          {windowWeeks.map(w => {
                            const prodH = m.hours[w] ?? 0;
                            const totalH = m.isManager ? (mgrTotalHours[m.id]?.[w] ?? prodH) : prodH;
                            const orders = m.ratio > 0 ? Math.round(prodH / m.ratio) : 0;
                            const cost = m.payType === 'salary' ? (m.annualSalary / 52) : totalH * m.rate;
                            const cpo = !m.isManager && orders > 0 && cost > 0 ? cost / orders : null;
                            return (
                              <td key={w} className={`px-2 py-1.5 text-center ${w === 0 ? 'bg-indigo-50/30' : ''}`}>
                                <input
                                  type="number" value={prodH || ''} min="0" step="0.5" placeholder="0"
                                  onChange={e => updateHours(m.id, w, parseFloat(e.target.value) || 0)}
                                  onDoubleClick={() => applyToAllWeeks(m.id, prodH)}
                                  title={m.isManager ? 'Production hours (double-click = all weeks)' : 'Double-click to apply to all weeks'}
                                  className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                />
                                {m.isManager && (
                                  <input
                                    type="number" value={totalH || ''} min="0" step="0.5" placeholder="total h"
                                    onChange={e => {
                                      const newH = { ...mgrTotalHours, [m.id]: [...(mgrTotalHours[m.id] ?? Array(WEEKS).fill(0))] };
                                      newH[m.id][w] = parseFloat(e.target.value) || 0;
                                      onMgrTotalHoursChange(newH);
                                    }}
                                    title="Total hours (production + managerial)"
                                    className="w-14 mt-0.5 border border-violet-200 rounded px-1.5 py-0.5 text-center text-[10px] text-violet-600 bg-violet-50 focus:outline-none focus:ring-1 focus:ring-violet-300"
                                  />
                                )}
                                {orders > 0 && <div className="text-slate-400 mt-0.5">{orders} ord</div>}
                                {cpo !== null && <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Week totals row */}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                        <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Week total</td>
                        {windowWeeks.map(w => {
                          const totalCost = team.reduce((s, m) => {
                            const prodH = m.hours[w] ?? 0;
                            const totalH = m.isManager ? (mgrTotalHours[m.id]?.[w] ?? prodH) : prodH;
                            return s + (m.payType === 'salary' ? m.annualSalary / 52 : totalH * m.rate);
                          }, 0);
                          const totalCPO = weeklyTotals[w] > 0 && totalCost > 0 ? totalCost / weeklyTotals[w] : null;
                          return (
                            <td key={w} className={`px-2 py-2 text-center ${w === 0 ? 'bg-indigo-50/50' : ''}`}>
                              <div className="text-indigo-700">{weeklyTotals[w]} ord</div>
                              {totalCPO !== null && <div className="text-amber-600 text-[10px]">{fmt$(totalCPO)}</div>}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Shopify default estimates row */}
                      <tr className="bg-slate-50/50">
                        <td className="sticky left-0 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">
                          Shopify est. ({location})
                        </td>
                        {windowWeeks.map(w => {
                          const weekIso = isoMonday(w);
                          const shopify = weeklyShopify[weekIso];
                          const defaultVal = shopify ? shopify[locKey] : null;
                          const override = weekOverrides[weekIso];
                          const displayVal = override ? override[locKey] : defaultVal;
                          return (
                            <td key={w} className="px-2 py-1.5 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="number" min="0" placeholder="—"
                                  value={override ? override[locKey] : ''}
                                  onChange={e => {
                                    const val = parseInt(e.target.value);
                                    const newOverrides = { ...weekOverrides };
                                    if (isNaN(val)) {
                                      delete newOverrides[weekIso];
                                    } else {
                                      newOverrides[weekIso] = {
                                        ut: location === 'Utah'    ? val : (weekOverrides[weekIso]?.ut ?? defaultVal ?? 0),
                                        ga: location === 'Georgia' ? val : (weekOverrides[weekIso]?.ga ?? defaultVal ?? 0),
                                      };
                                    }
                                    onPresSettingsChange({ ...presSettings, weekOverrides: newOverrides });
                                  }}
                                  className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center text-[11px] text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300"
                                  title="Override estimate. Leave blank to use Shopify default."
                                />
                                {defaultVal !== null && (
                                  <span className="text-[9px] text-slate-300" title="Shopify default">
                                    {override ? `def: ${defaultVal}` : defaultVal}
                                  </span>
                                )}
                                {displayVal !== null && displayVal !== undefined && (
                                  <div className={`text-[10px] font-medium ${weeklyTotals[w] >= displayVal ? 'text-green-600' : 'text-amber-600'}`}>
                                    {weeklyTotals[w] >= displayVal ? '✓' : `${displayVal - weeklyTotals[w]} short`}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-slate-400">Double-click any hours cell to apply that value to all 52 weeks for that team member.</p>
            </div>
          )}

        </div>
      )}

      {/* ── HISTORICALS TAB ── */}
      {presTab === 'historicals' && (
        <HistoricalsSection
          department="preservation"
          location={location}
          members={team.map(m => ({ id: m.id, name: m.name, payType: m.payType ?? 'hourly', hourlyRate: m.rate, annualSalary: m.annualSalary ?? 0, isManager: m.isManager }))}
          ordersLabel="bouquets"

        />
      )}
    </div>
  );
}

// ─── FulfillmentSection ────────────────────────────────────────────────────────

function FulfillmentSection({ location, fulfillmentQueue, countsLoading, teamActuals, onActualsSaved,
  ffHours, ffRoster, mgrTotalHours, onFfHoursChange, onFfRosterChange, onMgrTotalHoursChange }: {
  location:        'Utah' | 'Georgia';
  fulfillmentQueue: number;
  countsLoading:   boolean;
  teamActuals:     { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[];
  onActualsSaved:  () => void;
  ffHours:              Record<string, number[]>;
  ffRoster:             Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number }>;
  mgrTotalHours:        Record<string, number[]>;
  onFfHoursChange:      (h: Record<string, number[]>) => void;
  onFfRosterChange:     (r: Record<string, { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number }>) => void;
  onMgrTotalHoursChange:(h: Record<string, number[]>) => void;
}) {
  const [ffTab,      setFfTab]      = useState<'schedule' | 'historicals'>('schedule');
  const [showRoster, setShowRoster] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Merge persisted roster + hours over defaults
  const defaultTeam = location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM;
  const team: FfTeamMember[] = (() => {
    const base = defaultTeam.map(m => {
      const roster = ffRoster[m.id];
      const hours  = ffHours[m.id] ?? [...m.hours];
      return { ...m, ratio: roster?.ratio ?? m.ratio, rate: roster?.rate ?? m.rate, name: roster?.name ?? m.name,
        payType: roster?.payType ?? 'hourly' as const,
        annualSalary: roster?.annualSalary ?? 0, hours };
    });
    const defaultIds = new Set(defaultTeam.map(m => m.id));
    Object.entries(ffRoster).forEach(([id, r]) => {
      if (!defaultIds.has(id)) {
        base.push({ id, name: r.name ?? 'New Member', ratio: r.ratio ?? 1.0, pay: 'hourly' as const,
          payType: r.payType ?? 'hourly' as const, annualSalary: r.annualSalary ?? 0,
          rate: r.rate ?? 0, hours: ffHours[id] ?? Array(8).fill(0) });
      }
    });
    return base;
  })();

  function handleAddFfMember() {
    const id = `${location.toLowerCase()}-f-${Date.now()}`;
    onFfRosterChange({ ...ffRoster, [id]: { ratio: 1.0, rate: 0, name: 'New Member' } });
    onFfHoursChange({ ...ffHours, [id]: Array(8).fill(0) });
  }
  function handleRemoveFfMember(id: string) {
    const newRoster = { ...ffRoster }; delete newRoster[id];
    const newHours  = { ...ffHours };  delete newHours[id];
    onFfRosterChange(newRoster);
    onFfHoursChange(newHours);
  }
  function updateFfRosterName(id: string, name: string) {
    const existing = ffRoster[id] ?? { ratio: 1.0, rate: 0, name: 'New Member' };
    onFfRosterChange({ ...ffRoster, [id]: { ...existing, name } });
  }

  function updateHours(id: string, wi: number, val: number) {
    const member = team.find(m => m.id === id);
    if (!member) return;
    const currentHours = ffHours[id] ?? Array(WEEKS).fill(0);
    const newHours = { ...ffHours, [id]: currentHours.map((h: number, j: number) => j === wi ? val : h) };
    onFfHoursChange(newHours);
  }
  function applyToAllWeeks(id: string, hours: number) {
    onFfHoursChange({ ...ffHours, [id]: Array(WEEKS).fill(hours) });
  }
  function updateRoster(mi: number, field: 'ratio' | 'rate' | 'payType' | 'annualSalary' | 'role', val: number | string) {
    const id = team[mi]?.id;
    if (!id) return;
    const existing = ffRoster[id] ?? { ratio: team[mi].ratio, rate: team[mi].rate, name: team[mi].name, payType: 'hourly' as const, annualSalary: 0 };
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
              {showRoster ? '▲ Hide' : '▼ Edit'} fulfillment roster, ratios &amp; pay rates
            </button>
            {showRoster && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-5">
                <FfRosterEditor
                  team={team}
                  ffRoster={ffRoster}
                  onUpdateName={updateFfRosterName}
                  onUpdateRoster={updateRoster}
                  onRemove={handleRemoveFfMember}
                  onRefreshRatio={async (id, name) => {
                    try {
                      const res = await fetch(`/api/actuals?location=${location}&type=team&weeks=100`);
                      const data = await res.json() as { teamActuals?: { department: string; week_of: string; member_name: string; actual_hours: number; actual_orders: number }[] };
                      const rows = (data.teamActuals ?? []).filter(r => r.department === 'fulfillment' && r.member_name === name).sort((a, b) => b.week_of.localeCompare(a.week_of)).slice(0, 4);
                      const h = rows.reduce((s, r) => s + r.actual_hours, 0);
                      const o = rows.reduce((s, r) => s + r.actual_orders, 0);
                      if (o > 0 && h > 0) updateRoster(team.findIndex(m => m.id === id), 'ratio', Math.round(h / o * 100) / 100);
                    } catch {}
                  }}
                  onReorder={(newOrder) => {
                    const newRoster = { ...ffRoster };
                    newOrder.forEach((id, i) => {
                      newRoster[id] = { ...(newRoster[id] ?? { ratio: 1, rate: 0, name: '' }), _order: i } as typeof newRoster[string];
                    });
                    onFfRosterChange(newRoster);
                  }}
                />
                <button onClick={handleAddFfMember}
                  className="mt-4 text-xs px-3 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 transition-colors">
                  + Add team member
                </button>
                <p className="mt-3 text-xs text-slate-400"><strong>Ratio:</strong> hours per order. e.g. 0.5 = 1 order per 0.5 hrs.</p>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Hours per team member per week</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setWeekOffset(Math.max(0, weekOffset - WINDOW))} disabled={weekOffset === 0}
                  className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">← Prev</button>
                <span className="text-xs text-slate-400">{getWeekLabel(weekOffset)} – {getWeekLabel(weekOffset + WINDOW - 1)}</span>
                <button onClick={() => setWeekOffset(Math.min(WEEKS - WINDOW, weekOffset + WINDOW))} disabled={weekOffset + WINDOW >= WEEKS}
                  className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30">Next →</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 min-w-[160px]">Team member</th>
                    {Array.from({ length: WINDOW }, (_, i) => i + weekOffset).filter(i => i < WEEKS).map(w => (
                      <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px]">
                        {getWeekLabel(w)}{w === 0 && <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded px-1">now</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map((m, mi) => (
                    <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                      <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{m.name}</div>
                        <div className="text-slate-400">{m.ratio} h/ord</div>
                        {m.payType === 'salary' && <div className="text-[10px] text-amber-600">salary</div>}
                      </td>
                      {Array.from({ length: WINDOW }, (_, i) => i + weekOffset).filter(i => i < WEEKS).map(w => {
                        const prodH = (ffHours[m.id] ?? [])[w] ?? 0;
                        const totalH = m.isManager ? (mgrTotalHours[m.id]?.[w] ?? prodH) : prodH;
                        const o = m.ratio > 0 ? Math.round(prodH / m.ratio) : 0;
                        const cost = m.payType === 'salary' ? m.annualSalary / 52 : totalH * m.rate;
                        const cpo = !m.isManager && o > 0 && cost > 0 ? cost / o : null;
                        return (
                          <td key={w} className={`px-2 py-1.5 text-center ${w === 0 ? 'bg-indigo-50/30' : ''}`}>
                            <input type="number" value={prodH || ''} placeholder="0" min="0" step="0.5"
                              onChange={e => updateHours(m.id, w, parseFloat(e.target.value) || 0)}
                              onDoubleClick={() => applyToAllWeeks(m.id, prodH)}
                              title={m.isManager ? 'Production hours' : 'Double-click to apply to all weeks'}
                              className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                            {m.isManager && (
                              <input type="number" value={totalH || ''} placeholder="total h" min="0" step="0.5"
                                onChange={e => {
                                  const newH = { ...mgrTotalHours, [m.id]: [...(mgrTotalHours[m.id] ?? Array(WEEKS).fill(0))] };
                                  newH[m.id][w] = parseFloat(e.target.value) || 0;
                                  onMgrTotalHoursChange(newH);
                                }}
                                onDoubleClick={() => {
                                  const val = mgrTotalHours[m.id]?.[w] ?? prodH;
                                  const newH = { ...mgrTotalHours, [m.id]: Array(WEEKS).fill(val) };
                                  onMgrTotalHoursChange(newH);
                                }}
                                title="Total hours (production + managerial) — double-click to apply to all weeks"
                                className="w-14 mt-0.5 border border-violet-200 rounded px-1.5 py-0.5 text-center text-[10px] text-violet-600 bg-violet-50 focus:outline-none focus:ring-1 focus:ring-violet-300" />
                            )}
                            {o > 0 && <div className="text-slate-400 mt-0.5">{o} ord</div>}
                            {cpo !== null && <div className="text-amber-600 text-[10px]">{fmt$(cpo)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Week total</td>
                    {Array.from({ length: WINDOW }, (_, i) => i + weekOffset).filter(i => i < WEEKS).map(w => {
                      const c = team.reduce((s, m) => s + (m.ratio > 0 ? Math.round(((ffHours[m.id] ?? [])[w] ?? 0) / m.ratio) : 0), 0);
                      const cost = team.reduce((s, m) => {
                        const prodH = (ffHours[m.id] ?? [])[w] ?? 0;
                        const totalH = m.isManager ? (mgrTotalHours[m.id]?.[w] ?? prodH) : prodH;
                        return s + (m.payType === 'salary' ? m.annualSalary / 52 : totalH * m.rate);
                      }, 0);
                      const cpo = c > 0 && cost > 0 ? cost / c : null;
                      return (
                        <td key={w} className={`px-2 py-2 text-center ${w === 0 ? 'bg-indigo-50/50' : ''}`}>
                          <div className="text-amber-700">{c} ord</div>
                          {cpo !== null && <div className="text-[10px] text-amber-600">{fmt$(cpo)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-slate-400">Double-click any hours cell to apply that value to all 52 weeks for that team member.</p>
        </>
      )}

      {ffTab === 'historicals' && (
        <HistoricalsSection
          department="fulfillment"
          location={location}
          members={team.map(m => ({ id: m.id, name: m.name, payType: m.payType ?? 'hourly', hourlyRate: m.rate, annualSalary: m.annualSalary ?? 0, isManager: m.isManager }))}
          ordersLabel="orders"

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

// ─── CompanyMetricsBar ────────────────────────────────────────────────────────


function MetricCell({ label, value, sub, warn }: { label: string; value: string | null; sub?: string; warn?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${value ? 'text-slate-800' : 'text-slate-300'}`}>
        {value ?? '—'}
      </span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
      {warn && <span className="text-[10px] text-amber-500">⚠ {warn}</span>}
    </div>
  );
}

function PeriodBlock({ label, metrics, goalMetrics, showCPO }: {
  label: string;
  metrics: { combinedRatio: number | null; combinedCPO: number | null; combinedGoalRatio?: number | null; combinedGoalCPO?: number | null; design: { missingRates: string[] }; preservation: { missingRates: string[] }; fulfillment: { missingRates: string[] } };
  goalMetrics?: { combinedGoalRatio: number | null; combinedGoalCPO: number | null } | null;
  showCPO: boolean;
}) {
  const allMissing = [...metrics.design.missingRates, ...metrics.preservation.missingRates, ...metrics.fulfillment.missingRates];
  const uniqueMissing = [...new Set(allMissing)];
  const gRatio = goalMetrics?.combinedGoalRatio ?? metrics.combinedGoalRatio ?? null;
  const gCPO   = goalMetrics?.combinedGoalCPO   ?? metrics.combinedGoalCPO   ?? null;
  const actual = metrics.combinedRatio;
  const ratioColor = actual !== null && gRatio !== null
    ? actual <= gRatio ? 'text-green-600' : 'text-red-500'
    : 'text-slate-800';
  return (
    <div className="flex flex-col gap-1 px-4 border-r border-slate-200 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">{label}</span>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide w-8">Ratio</span>
          <span className={`text-sm font-semibold ${ratioColor}`}>{actual !== null ? actual.toFixed(2) : '—'}</span>
          {gRatio !== null && <span className="text-[10px] text-slate-400">/ <span className="text-green-600 font-medium">{gRatio.toFixed(2)}</span> goal</span>}
        </div>
        {showCPO && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide w-8">CPO</span>
            <span className="text-sm font-semibold text-slate-800">{metrics.combinedCPO !== null ? fmt$(metrics.combinedCPO) : '—'}</span>
            {gCPO !== null && <span className="text-[10px] text-slate-400">/ <span className="text-green-600 font-medium">{fmt$(gCPO)}</span> goal</span>}
            {uniqueMissing.length > 0 && metrics.combinedCPO === null && <span className="text-[9px] text-amber-500">⚠ rates missing</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DeptKPIBar({ dept, location, metrics, showCPO }: {
  dept: 'design' | 'preservation' | 'fulfillment';
  location: string;
  metrics: ReturnType<typeof import('./useHistoricalMetrics').useHistoricalMetrics>;
  showCPO: boolean;
}) {
  if (metrics.loading) return null;
  const tm = metrics.thisMonth[dept];
  const lm = metrics.lastMonth[dept];
  const lw = metrics.lastWeek[dept];
  const tg = metrics.thisMonthGoal[dept];
  const ng = metrics.nextMonthGoal[dept];
  return (
    <div className="bg-white border border-slate-100 rounded-xl px-5 py-3 flex items-center gap-0 flex-wrap gap-y-3">
      <div className="pr-4 mr-2 border-r border-slate-200 shrink-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dept} · {location}</p>
        <p className="text-[10px] text-slate-400">Rolling KPIs</p>
      </div>
      {[
        { label: 'This month', d: tm, g: tg },
        { label: 'Last month', d: lm, g: null },
        { label: 'Last week',  d: lw, g: null },
        { label: 'Next month goal', d: ng, g: ng },
      ].map(({ label, d, g }) => {
        const ratioColor = d.ratio !== null && d.goalRatio !== null
          ? d.ratio <= d.goalRatio ? 'text-green-600' : 'text-red-500'
          : 'text-slate-800';
        const isGoalOnly = d.orders === 0 && d.goalRatio !== null;
        return (
          <div key={label} className="flex flex-col gap-0.5 px-4 border-r border-slate-100 last:border-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">{label}</span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] text-slate-400 w-8">Ratio</span>
                {!isGoalOnly && <span className={`text-sm font-semibold ${ratioColor}`}>{d.ratio !== null ? d.ratio.toFixed(2) : '—'}</span>}
                {(g ?? d).goalRatio !== null && (
                  <span className="text-[10px] text-slate-400">
                    {!isGoalOnly && '/ '}<span className="text-green-600 font-medium">{(g ?? d).goalRatio!.toFixed(2)}</span> goal
                  </span>
                )}
              </div>
              {showCPO && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-slate-400 w-8">CPO</span>
                  {!isGoalOnly && <span className="text-sm font-semibold text-slate-800">{d.cpo !== null ? fmt$(d.cpo) : '—'}</span>}
                  {(g ?? d).goalCPO !== null && (
                    <span className="text-[10px] text-slate-400">
                      {!isGoalOnly && '/ '}<span className="text-green-600 font-medium">{fmt$((g ?? d).goalCPO!)}</span> goal
                    </span>
                  )}
                  {d.missingRates.length > 0 && d.cpo === null && <span className="text-[9px] text-amber-500">⚠ rates missing</span>}
                </div>
              )}
              {!isGoalOnly && d.orders > 0 && <span className="text-[10px] text-slate-400">{d.orders} orders</span>}
            </div>
          </div>
        );
      })}
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

  // Merge persisted roster over defaults — includes custom added designers
  const designers: Designer[] = (() => {
    const base = defaultDesigners.map(d => {
      const persisted = settings.designRoster[d.id];
      if (!persisted) return d;
      return { ...d, name: persisted.name ?? d.name, ratio: persisted.ratio, payType: persisted.payType, hourlyRate: persisted.hourlyRate, annualSalary: persisted.annualSalary };
    });
    const defaultIds = new Set(defaultDesigners.map(d => d.id));
    Object.entries(settings.designRoster).forEach(([id, r]) => {
      if (!defaultIds.has(id)) {
        base.push({ id, name: r.name ?? 'New Designer', ratio: r.ratio ?? 1.5, payType: r.payType ?? 'hourly', hourlyRate: r.hourlyRate ?? 0, annualSalary: r.annualSalary ?? 0 });
      }
    });
    return base;
  })();

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

  // ── Historical metrics for KPI bars ─────────────────────────────────────────
  const historicalMetrics = useHistoricalMetrics(location, {
    design: designers.map(d => ({
      name: d.name, payType: d.payType, hourlyRate: d.hourlyRate, annualSalary: d.annualSalary, ratio: d.ratio,
      isManager: !!((settings.designRoster[d.id] as {isManager?:boolean})?.isManager || (d as {isManager?:boolean}).isManager),
      role: ((settings.designRoster[d.id] as {role?:string})?.role ?? (d as {role?:string}).role ?? 'specialist') as 'specialist'|'senior'|'master',
      scheduledHours: Array.from({ length: WEEKS }, (_, w) => schedule[w]?.[d.id] ?? 0),
      mgrTotalHours: settings.mgrTotalHours[d.id],
    })),
    preservation: (location === 'Utah' ? UTAH_PRESERVATION_TEAM : GEORGIA_PRESERVATION_TEAM).map(m => {
      const r = settings.presRoster[m.id];
      return {
        name: r?.name ?? m.name, payType: r?.payType ?? 'hourly' as const,
        hourlyRate: r?.rate ?? m.rate, annualSalary: r?.annualSalary ?? 0, ratio: r?.ratio ?? m.ratio,
        isManager: (r as {isManager?:boolean})?.isManager ?? m.isManager,
        role: ((r as {role?:string})?.role ?? m.role ?? 'specialist') as 'specialist'|'senior'|'master',
        scheduledHours: settings.presHours[m.id] ?? Array(WEEKS).fill(0),
        mgrTotalHours: settings.mgrTotalHours[m.id],
      };
    }),
    fulfillment: (location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM).map(m => {
      const r = settings.ffRoster[m.id];
      return {
        name: r?.name ?? m.name, payType: r?.payType ?? 'hourly' as const,
        hourlyRate: r?.rate ?? 0, annualSalary: r?.annualSalary ?? 0, ratio: r?.ratio ?? m.ratio,
        isManager: (r as {isManager?:boolean})?.isManager ?? m.isManager,
        role: ((r as {role?:string})?.role ?? m.role ?? 'specialist') as 'specialist'|'senior'|'master',
        scheduledHours: settings.ffHours[m.id] ?? Array(WEEKS).fill(0),
        mgrTotalHours: settings.mgrTotalHours[m.id],
      };
    }),
  });
  const hasAnyRates = [...designers, ...(location === 'Utah' ? UTAH_PRESERVATION_TEAM : GEORGIA_PRESERVATION_TEAM), ...(location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM)].some(m => {
    const anyM = m as {rate?: number; hourlyRate?: number; annualSalary?: number; payType?: string};
    return (anyM.rate ?? anyM.hourlyRate ?? 0) > 0 || (anyM.annualSalary ?? 0) > 0;
  });
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
  function handleMgrTotalHoursChange(weekIdx: number, designerId: string, value: string) {
    const newHours = { ...settings.mgrTotalHours };
    if (!newHours[designerId]) newHours[designerId] = Array(WEEKS).fill(0);
    newHours[designerId] = [...newHours[designerId]];
    newHours[designerId][weekIdx] = parseFloat(value) || 0;
    update('mgrTotalHours', newHours);
  }
  function applyToAllWeeks(designerId: string, hours: number) {
    const newHours = { ...settings.designHours, [designerId]: Array(WEEKS).fill(hours) };
    update('designHours', newHours);
  }

  // ── Per-designer stats ────────────────────────────────────────────────────────
  function weekStats(weekIdx: number, d: Designer) {
    const hrs    = schedule[weekIdx]?.[d.id] ?? 0;
    const frames = d.ratio > 0 ? hrs / d.ratio : 0;
    const isDesignMgr = !!((settings.designRoster[d.id] as {isManager?:boolean})?.isManager || (d as {isManager?:boolean}).isManager);
    const totalHrs = isDesignMgr ? (settings.mgrTotalHours[d.id]?.[weekIdx] ?? hrs) : hrs;
    const cost   = d.payType === 'salary' ? d.annualSalary / 52 : totalHrs * d.hourlyRate;
    const cpo    = !isDesignMgr && frames > 0 && cost > 0 ? cost / frames : null;
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

      {/* ── Company KPI bar ─────────────────────────────────────────────────── */}
      {!historicalMetrics.loading && (
        <div className="bg-white border border-slate-100 rounded-xl px-5 py-3 flex items-center gap-0 flex-wrap gap-y-3">
          <div className="pr-4 mr-2 border-r border-slate-200 shrink-0">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Company · {location}</p>
            <p className="text-[10px] text-slate-400">All departments combined</p>
          </div>
          <PeriodBlock label="This month" metrics={historicalMetrics.thisMonth} goalMetrics={historicalMetrics.thisMonthGoal} showCPO={hasAnyRates} />
          <PeriodBlock label="Last month" metrics={historicalMetrics.lastMonth} showCPO={hasAnyRates} />
          <PeriodBlock label="Last week"  metrics={historicalMetrics.lastWeek}  showCPO={hasAnyRates} />
          <PeriodBlock label="Next month goal" metrics={historicalMetrics.nextMonthGoal} goalMetrics={historicalMetrics.nextMonthGoal} showCPO={hasAnyRates} />
        </div>
      )}

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
        <>
        <DeptKPIBar dept="preservation" location={location} metrics={historicalMetrics} showCPO={hasAnyRates} />
        <PreservationSection
          location={location}
          preservationQueue={preservationQueue}
          countsLoading={countsLoading}
          teamActuals={teamActuals}
          presHours={settings.presHours}
          presRoster={settings.presRoster}
          presSettings={settings.presSettings}
          mgrTotalHours={settings.mgrTotalHours}
          onPresHoursChange={(h) => update('presHours', h)}
          onPresRosterChange={(r) => update('presRoster', r)}
          onPresSettingsChange={(s) => update('presSettings', s)}
          onMgrTotalHoursChange={(h) => update('mgrTotalHours', h)}
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
        </>
      )}

      {/* ── FULFILLMENT dept ────────────────────────────────────────────────── */}
      {dept === 'fulfillment' && (
        <>
        <DeptKPIBar dept="fulfillment" location={location} metrics={historicalMetrics} showCPO={hasAnyRates} />
        <FulfillmentSection
          location={location}
          fulfillmentQueue={fulfillmentQueue}
          countsLoading={countsLoading}
          teamActuals={teamActuals}
          ffHours={settings.ffHours}
          ffRoster={settings.ffRoster}
          mgrTotalHours={settings.mgrTotalHours}
          onFfHoursChange={(h) => update('ffHours', h)}
          onFfRosterChange={(r) => update('ffRoster', r)}
          onMgrTotalHoursChange={(h) => update('mgrTotalHours', h)}
          onActualsSaved={() => {
            fetch(`/api/actuals?location=${location}&type=team&weeks=52`)
              .then(r => r.json())
              .then((d: { teamActuals?: typeof teamActuals }) => setTeamActuals(d.teamActuals ?? []))
              .catch(() => {});
          }}
        />
        </>
      )}

      {/* ── DESIGN dept ─────────────────────────────────────────────────────── */}
      {dept === 'design' && (
        <>
          <DeptKPIBar dept="design" location={location} metrics={historicalMetrics} showCPO={hasAnyRates} />
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
                          const isDesignMgr = !!((settings.designRoster[d.id] as {isManager?:boolean})?.isManager || (d as {isManager?:boolean}).isManager);
                          const totalH = isDesignMgr ? (settings.mgrTotalHours[d.id]?.[w] ?? hrs) : hrs;
                          return (
                            <td key={w} className={`px-2 py-1.5 text-center ${w === 0 ? 'bg-indigo-50/30' : ''}`}>
                              <input
                                type="number" value={hrs || ''} min="0" step="0.5" placeholder="0"
                                onChange={e => handleHoursChange(w, d.id, e.target.value)}
                                onDoubleClick={() => applyToAllWeeks(d.id, hrs)}
                                title={isDesignMgr ? 'Production hours' : 'Double-click to apply to all weeks'}
                                className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              />
                              {isDesignMgr && (
                                <input
                                  type="number" value={totalH || ''} min="0" step="0.5" placeholder="total h"
                                  onChange={e => handleMgrTotalHoursChange(w, d.id, e.target.value)}
                                  title="Total hours (production + managerial)"
                                  className="w-14 mt-0.5 border border-violet-200 rounded px-1.5 py-0.5 text-center text-[10px] text-violet-600 bg-violet-50 focus:outline-none focus:ring-1 focus:ring-violet-300"
                                />
                              )}
                              {frames > 0 && (
                                <div className="text-slate-400 mt-0.5">{Math.round(frames)}f</div>
                              )}
                              {showCPO && !isDesignMgr && cpo !== null && (
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
            <HistoricalsSection
              department="design"
              location={location}
              members={designers.map(d => ({ id: d.id, name: d.name, payType: d.payType, hourlyRate: d.hourlyRate, annualSalary: d.annualSalary }))}
              ordersLabel="frames"
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
