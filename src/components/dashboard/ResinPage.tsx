'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ResinMember {
  id:          string;
  name:        string;
  ratio:       number;   // hours per unit
  payType:     'hourly' | 'salary';
  hourlyRate:  number;
  annualSalary: number;
}

interface WeekSchedule {
  [memberId: string]: number;  // hours scheduled
}

interface CohortRow {
  weekOf:       string;   // ISO date — Monday of intake week
  weekLabel:    string;
  units:        number;   // resin units that entered queue this week
  weeksToComplete: number | null;
}

interface QueueSummary {
  totalUnits:    number;
  utahOrigin:    number;
  georgiaOrigin: number;
  unknownOrigin: number;
  cohorts:       { weekOf: string; units: number }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WEEKS = 52;
const WINDOW = 8;  // weeks visible in the schedule grid at once

const DEFAULT_RESIN_ROSTER: ResinMember[] = [
  { id: 'resin-1', name: 'Preslee Peterson', ratio: 1.5, payType: 'hourly', hourlyRate: 0, annualSalary: 0 },
];

function getMondayDate(offsetWeeks: number): Date {
  const d   = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekLabel(offsetWeeks: number): string {
  const d = getMondayDate(offsetWeeks);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function mondayOf(dateStr: string): Date {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

function useResinSettings() {
  const [roster,    setRosterState]  = useState<ResinMember[]>(DEFAULT_RESIN_ROSTER);
  const [hours,     setHoursState]   = useState<WeekSchedule[]>(() =>
    Array.from({ length: WEEKS }, () => ({ 'resin-1': 0 }))
  );
  const [actuals,   setActualsState] = useState<{ weekOf: string; memberId: string; memberName: string; hours: number; units: number }[]>([]);
  const [loading,   setLoading]      = useState(true);
  const [saveState, setSaveState]    = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, actualsRes] = await Promise.all([
          fetch('/api/schedule-settings?location=Resin'),
          fetch('/api/actuals?dept=resin'),
        ]);
        const settings = await settingsRes.json();
        const actualsData = await actualsRes.json();

        if (settings.resinRoster)  setRosterState(settings.resinRoster);
        if (settings.resinHours)   setHoursState(settings.resinHours);
        if (actualsData.actuals)   setActualsState(actualsData.actuals);
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  function persist(key: string, value: unknown) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      setSaveState('saving');
      try {
        await fetch('/api/schedule-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: 'Resin', key, value }),
        });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch { setSaveState('error'); }
    }, 500);
  }

  function setRoster(r: ResinMember[]) { setRosterState(r); persist('resinRoster', r); }
  function setHours(h: WeekSchedule[]) { setHoursState(h);  persist('resinHours',  h); }

  return { roster, setRoster, hours, setHours, actuals, setActualsState, loading, saveState };
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ResinPageProps {
  resinQueue?: number;  // live count from dashboard (if wired up)
}

export default function ResinPage({ resinQueue }: ResinPageProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'queue' | 'historicals'>('schedule');
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCPO, setShowCPO] = useState(false);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveResult, setMoveResult] = useState<string | null>(null);

  const { roster, setRoster, hours, setHours, actuals, setActualsState, loading, saveState } =
    useResinSettings();

  // Fetch queue summary
  useEffect(() => {
    fetch('/api/resin/queue?summary=true')
      .then(r => r.json())
      .then(d => setQueueSummary(d))
      .catch(() => {})
      .finally(() => setQueueLoading(false));
  }, []);

  // ── Derived: weekly capacity ───────────────────────────────────────────────
  const windowWeeks = Array.from({ length: WINDOW }, (_, i) => weekOffset + i);

  function weeklyCapacity(weekIdx: number): number {
    const schedule = hours[weekIdx] ?? {};
    return roster.reduce((sum, m) => {
      const h = schedule[m.id] ?? 0;
      return sum + (m.ratio > 0 ? h / m.ratio : 0);
    }, 0);
  }

  const avgWeeklyCapacity = (() => {
    let total = 0;
    for (let w = 0; w < 8; w++) total += weeklyCapacity(w);
    return total / 8;
  })();

  // ── Derived: turnaround simulation ────────────────────────────────────────
  const cohortRows: CohortRow[] = (() => {
    if (!queueSummary) return [];

    const now = getMondayDate(0);
    let queueRemaining = queueSummary.totalUnits;
    const cap = avgWeeklyCapacity > 0 ? avgWeeklyCapacity : 1;

    return queueSummary.cohorts.map(({ weekOf, units }) => {
      const cohortMonday = mondayOf(weekOf);
      const weeksBehindNow = Math.round(
        (now.getTime() - cohortMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );

      // How many weeks from now until this cohort is reached?
      // FIFO: weeks to reach = queueRemaining / capacity (at start of this cohort's turn)
      const weeksFromNow = queueRemaining > 0 ? Math.ceil(queueRemaining / cap) : 0;
      const weeksToComplete = weeksBehindNow + weeksFromNow;

      // After this cohort is "used up", reduce the queue
      queueRemaining = Math.max(0, queueRemaining - units);

      return {
        weekOf,
        weekLabel: cohortMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        units,
        weeksToComplete: weeksToComplete > 0 ? weeksToComplete : null,
      };
    });
  })();

  // ── Handlers ──────────────────────────────────────────────────────────────

  function updateHours(weekIdx: number, memberId: string, val: number) {
    const next = [...hours];
    if (!next[weekIdx]) next[weekIdx] = {};
    next[weekIdx] = { ...next[weekIdx], [memberId]: val };
    setHours(next);
  }

  function updateRosterField(id: string, field: keyof ResinMember, val: string | number) {
    setRoster(roster.map(m => m.id === id ? { ...m, [field]: val } : m));
  }

  function addMember() {
    const id = `resin-${Date.now()}`;
    setRoster([...roster, { id, name: 'Team Member', ratio: 1.5, payType: 'hourly', hourlyRate: 0, annualSalary: 0 }]);
  }

  function removeMember(id: string) {
    setRoster(roster.filter(m => m.id !== id));
  }

  async function syncQueue() {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/cron/resin-queue-sync', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      });
      const d = await res.json();
      setSyncResult(`Synced ${d.synced ?? 0} resin items (${d.skipped ?? 0} skipped — not yet bouquetReceived)`);
      // Refresh summary
      const s = await fetch('/api/resin/queue?summary=true').then(r => r.json());
      setQueueSummary(s);
    } catch (e) {
      setSyncResult('Sync failed — check console');
    } finally {
      setSyncLoading(false);
    }
  }

  async function moveGeorgiaToUtah(dryRun = false) {
    setMoveLoading(true);
    setMoveResult(null);
    try {
      const res = await fetch(
        `/api/admin/sync-resin-locations${dryRun ? '?dryRun=true' : ''}`,
        { method: 'POST', headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` } }
      );
      const d = await res.json();
      setMoveResult(
        dryRun
          ? `Dry run: ${d.moved ?? 0} orders would be moved, ${d.cannotMove ?? 0} cannot be moved, ${d.alreadyUtah ?? 0} already Utah`
          : `Moved ${d.moved ?? 0} orders to Utah, ${d.cannotMove ?? 0} cannot be moved (already fulfilled)`
      );
    } catch {
      setMoveResult('Move failed — check console');
    } finally {
      setMoveLoading(false);
    }
  }

  const hasRates = roster.some(m => m.hourlyRate > 0 || m.annualSalary > 0);

  const TABS = [
    { id: 'schedule'    as const, label: 'Weekly Schedule' },
    { id: 'queue'       as const, label: 'Queue & Turnaround' },
    { id: 'historicals' as const, label: 'Historicals' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
        <span className="ml-3 text-sm text-slate-500">Loading resin schedule…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h2 className="text-sm font-semibold text-slate-700">Resin Scheduling</h2>
          {saveState === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
          {saveState === 'saved'  && <span className="text-xs text-emerald-500">Saved</span>}
          {saveState === 'error'  && <span className="text-xs text-red-500">Save failed</span>}
        </div>

        {/* Queue summary pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {queueLoading ? (
            <span className="text-xs text-slate-400">Loading queue…</span>
          ) : queueSummary ? (
            <>
              <span className="text-xs bg-purple-50 border border-purple-100 text-purple-700 rounded-full px-3 py-1 font-medium">
                {queueSummary.totalUnits.toLocaleString()} in queue
              </span>
              {queueSummary.georgiaOrigin > 0 && (
                <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-3 py-1">
                  {queueSummary.georgiaOrigin} Georgia-origin
                </span>
              )}
              {queueSummary.utahOrigin > 0 && (
                <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-full px-3 py-1">
                  {queueSummary.utahOrigin} Utah-origin
                </span>
              )}
            </>
          ) : null}
          <button
            onClick={syncQueue}
            disabled={syncLoading}
            className="text-xs border border-slate-200 rounded px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncLoading ? 'Syncing…' : 'Sync Queue'}
          </button>
        </div>
      </div>

      {syncResult && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded px-3 py-2">{syncResult}</p>
      )}

      {/* ── Georgia transfer section ───────────────────────────────────────────── */}
      {(queueSummary?.georgiaOrigin ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {queueSummary!.georgiaOrigin} resin orders originated in Georgia
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              All resin orders are completed in Utah. Use the button to bulk-move Georgia orders
              to the Utah fulfillment location in Shopify.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => moveGeorgiaToUtah(true)}
              disabled={moveLoading}
              className="text-xs border border-amber-300 bg-white text-amber-700 rounded px-3 py-1.5 hover:bg-amber-50 disabled:opacity-50"
            >
              Dry Run
            </button>
            <button
              onClick={() => moveGeorgiaToUtah(false)}
              disabled={moveLoading}
              className="text-xs bg-amber-600 text-white rounded px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
            >
              {moveLoading ? 'Moving…' : 'Move to Utah'}
            </button>
          </div>
          {moveResult && (
            <p className="w-full text-xs text-amber-700 mt-1">{moveResult}</p>
          )}
        </div>
      )}

      {/* ── Roster ────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Resin Team</h3>
          <button
            onClick={addMember}
            className="text-xs border border-slate-200 rounded px-2.5 py-1 text-slate-600 hover:bg-slate-50"
          >
            + Add member
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Name</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">Ratio (hrs/unit)</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">Pay type</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">Rate</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap">CPO</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {roster.map((m, i) => {
                const cpo = m.ratio > 0 && (m.hourlyRate > 0 || m.annualSalary > 0)
                  ? m.payType === 'hourly'
                    ? m.ratio * m.hourlyRate
                    : (m.annualSalary / 52) / (m.ratio > 0 ? (40 / m.ratio) : 1)
                  : null;

                return (
                  <tr key={m.id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-1.5">
                      <input
                        value={m.name}
                        onChange={e => updateRosterField(m.id, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 outline-none text-slate-700 font-medium text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="number"
                        value={m.ratio}
                        min={0.1}
                        step={0.1}
                        onChange={e => updateRosterField(m.id, 'ratio', parseFloat(e.target.value) || 1)}
                        className="w-16 text-center bg-white border border-slate-200 rounded px-1 py-0.5 text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <select
                        value={m.payType}
                        onChange={e => updateRosterField(m.id, 'payType', e.target.value)}
                        className="bg-white border border-slate-200 rounded px-1 py-0.5 text-xs"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="salary">Salary</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {m.payType === 'hourly' ? (
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={m.hourlyRate || ''}
                            placeholder="0"
                            min={0}
                            onChange={e => updateRosterField(m.id, 'hourlyRate', parseFloat(e.target.value) || 0)}
                            className="w-16 text-center bg-white border border-slate-200 rounded px-1 py-0.5 text-xs"
                          />
                          <span className="text-slate-400">/hr</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={m.annualSalary || ''}
                            placeholder="0"
                            min={0}
                            onChange={e => updateRosterField(m.id, 'annualSalary', parseFloat(e.target.value) || 0)}
                            className="w-20 text-center bg-white border border-slate-200 rounded px-1 py-0.5 text-xs"
                          />
                          <span className="text-slate-400">/yr</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center text-slate-600">
                      {cpo !== null ? `$${cpo.toFixed(2)}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {roster.length > 1 && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="text-slate-300 hover:text-red-400 text-xs"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-100">
        <div className="flex gap-0">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── WEEKLY SCHEDULE TAB ───────────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-semibold text-slate-700">Hours per team member per week</h3>
              {hasRates && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={showCPO} onChange={e => setShowCPO(e.target.checked)} className="rounded" />
                  Show CPO
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset(Math.max(0, weekOffset - WINDOW))}
                disabled={weekOffset === 0}
                className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30"
              >← Prev</button>
              <span className="text-xs text-slate-400">
                {getWeekLabel(weekOffset)} – {getWeekLabel(weekOffset + WINDOW - 1)}
              </span>
              <button
                onClick={() => setWeekOffset(Math.min(WEEKS - WINDOW, weekOffset + WINDOW))}
                disabled={weekOffset + WINDOW >= WEEKS}
                className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-30"
              >Next →</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[160px]">
                    Team Member
                  </th>
                  {windowWeeks.map(w => (
                    <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px]">
                      {getWeekLabel(w)}
                      {w === 0 && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 rounded px-1">now</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((m, mi) => (
                  <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="sticky left-0 bg-white px-4 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                      {m.name}
                      <div className="text-[10px] text-slate-400 font-normal">{m.ratio}h/unit</div>
                    </td>
                    {windowWeeks.map(w => {
                      const h    = hours[w]?.[m.id] ?? 0;
                      const units = m.ratio > 0 ? h / m.ratio : 0;
                      const cost  = m.payType === 'hourly' ? h * m.hourlyRate : (m.annualSalary / 52 / 5) * (h / 8);
                      const cpo   = units > 0 && cost > 0 ? cost / units : null;
                      return (
                        <td key={w} className="px-1 py-1 text-center">
                          <input
                            type="number"
                            value={h || ''}
                            placeholder="0"
                            min={0}
                            onChange={e => updateHours(w, m.id, parseFloat(e.target.value) || 0)}
                            className="w-full text-center bg-white border border-slate-100 rounded px-1 py-1 text-xs hover:border-purple-300 focus:border-purple-400 focus:outline-none"
                          />
                          {h > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {units.toFixed(0)}u
                              {showCPO && cpo !== null && (
                                <span className="ml-1 text-purple-500">${cpo.toFixed(2)}</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-purple-50 border-t border-purple-100 font-medium">
                  <td className="sticky left-0 bg-purple-50 px-4 py-2 text-xs text-purple-700">Week total</td>
                  {windowWeeks.map(w => {
                    const cap = weeklyCapacity(w);
                    return (
                      <td key={w} className="px-3 py-2 text-center text-xs text-purple-700">
                        {cap > 0 ? `${cap.toFixed(0)}u` : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── QUEUE & TURNAROUND TAB ────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Resin Queue</p>
              <p className="text-xl font-semibold text-purple-700">
                {queueLoading ? '…' : (queueSummary?.totalUnits ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">unfulfilled resin units</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Avg capacity</p>
              <p className="text-xl font-semibold text-slate-700">
                {avgWeeklyCapacity.toFixed(0)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">units/week (next 8 wks)</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Utah origin</p>
              <p className="text-xl font-semibold text-slate-700">
                {queueLoading ? '…' : (queueSummary?.utahOrigin ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">started in Utah</p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-500 mb-1">Georgia origin</p>
              <p className="text-xl font-semibold text-amber-700">
                {queueLoading ? '…' : (queueSummary?.georgiaOrigin ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-amber-500 mt-0.5">need to transfer to Utah</p>
            </div>
          </div>

          {/* Turnaround bars */}
          <div className="bg-white border border-slate-100 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Turnaround — by order intake week
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Based on {(queueSummary?.totalUnits ?? 0).toLocaleString()} units in queue
              · {avgWeeklyCapacity.toFixed(0)} units/week avg capacity · FIFO sort
            </p>

            {cohortRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                No queue data yet — click "Sync Queue" to pull from Shopify
              </p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {[...cohortRows].reverse().map(row => {
                  const wks = row.weeksToComplete;
                  const barColor =
                    wks === null     ? 'bg-slate-200' :
                    wks <= 6         ? 'bg-emerald-400' :
                    wks <= 12        ? 'bg-yellow-400' :
                    'bg-red-400';
                  const labelColor =
                    wks === null     ? 'text-slate-400' :
                    wks <= 6         ? 'text-emerald-700' :
                    wks <= 12        ? 'text-yellow-700' :
                    'text-red-700';
                  const maxWks = Math.max(...cohortRows.map(r => r.weeksToComplete ?? 0), 1);
                  const barWidth = wks !== null ? `${Math.min(100, (wks / maxWks) * 100)}%` : '4px';

                  return (
                    <div key={row.weekOf} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-20 shrink-0 text-right">
                        {row.weekLabel}
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-slate-50 rounded-full h-5 relative overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: barWidth }}
                          />
                        </div>
                        <span className={`text-xs font-medium w-16 shrink-0 ${labelColor}`}>
                          {wks !== null ? `${wks} wks` : '—'}
                        </span>
                        <span className="text-xs text-slate-400 w-12 shrink-0 text-right">
                          {row.units}u
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 mt-4 flex-wrap">
              {[
                { color: 'bg-emerald-400', label: '≤6 wks — on track' },
                { color: 'bg-yellow-400',  label: '7–12 wks — backlog' },
                { color: 'bg-red-400',     label: '13+ wks — behind' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Full queue table */}
          <ResinQueueTable />
        </div>
      )}

      {/* ── HISTORICALS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'historicals' && (
        <ResinHistoricalsSection
          roster={roster}
          actuals={actuals}
          onActualsChange={setActualsState}
        />
      )}
    </div>
  );
}

// ─── Queue table sub-component ─────────────────────────────────────────────────

function ResinQueueTable() {
  const [orders, setOrders] = useState<ResinQueueRow[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/resin/queue?page=${p}&pageSize=50`);
      const d   = await res.json();
      setOrders(d.orders ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  if (loading) return (
    <div className="bg-white border border-slate-100 rounded-xl p-8 text-center">
      <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mx-auto" />
    </div>
  );

  if (orders.length === 0) return (
    <div className="bg-white border border-slate-100 rounded-xl p-8 text-center text-sm text-slate-400">
      No resin orders in queue. Sync the queue to pull from Shopify.
    </div>
  );

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Queue — all {total.toLocaleString()} units</h3>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button onClick={() => { setPage(p => Math.max(1, p - 1)); fetchPage(Math.max(1, page - 1)); }}
            disabled={page === 1} className="disabled:opacity-30 hover:text-slate-600">← Prev</button>
          <span>p.{page}/{totalPages}</span>
          <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchPage(Math.min(totalPages, page + 1)); }}
            disabled={page === totalPages} className="disabled:opacity-30 hover:text-slate-600">Next →</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2 text-left font-medium text-slate-500">Order #</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Product</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">PF Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Origin</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Order date</th>
              <th className="px-3 py-2 text-center font-medium text-slate-500">Qty</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.line_item_id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                <td className="px-4 py-1.5 font-medium text-slate-700">#{o.shopify_order_number}</td>
                <td className="px-3 py-1.5 text-slate-600">
                  {o.line_item_title}
                  {o.variant_title && <span className="text-slate-400"> · {o.variant_title}</span>}
                </td>
                <td className="px-3 py-1.5">
                  <span className="bg-purple-50 text-purple-700 rounded px-1.5 py-0.5 text-[10px]">
                    {o.pf_status ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {o.origin_location === 'Georgia'
                    ? <span className="text-amber-600 font-medium">Georgia</span>
                    : <span className="text-slate-500">{o.origin_location ?? '—'}</span>
                  }
                </td>
                <td className="px-3 py-1.5 text-slate-500">{o.order_date ?? '—'}</td>
                <td className="px-3 py-1.5 text-center text-slate-600">{o.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Historicals sub-component ─────────────────────────────────────────────────

interface ResinActual {
  weekOf:     string;
  memberId:   string;
  memberName: string;
  hours:      number;
  units:      number;
}

function ResinHistoricalsSection({
  roster,
  actuals,
  onActualsChange,
}: {
  roster:           ResinMember[];
  actuals:          ResinActual[];
  onActualsChange:  (a: ResinActual[]) => void;
}) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Past 8 weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = getMondayDate(-(i + 1));
    return isoDate(d);
  }).reverse();

  function getActual(weekOf: string, memberId: string): ResinActual | undefined {
    return actuals.find(a => a.weekOf === weekOf && a.memberId === memberId);
  }

  async function updateActual(weekOf: string, member: ResinMember, field: 'hours' | 'units', val: number) {
    const existing = getActual(weekOf, member.id);
    const updated: ResinActual = {
      weekOf,
      memberId:   member.id,
      memberName: member.name,
      hours:      field === 'hours' ? val : (existing?.hours ?? 0),
      units:      field === 'units' ? val : (existing?.units ?? 0),
    };

    const next = actuals.filter(a => !(a.weekOf === weekOf && a.memberId === member.id));
    next.push(updated);
    onActualsChange(next);

    setSaveState('saving');
    try {
      await fetch('/api/actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept: 'resin', ...updated }),
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch { setSaveState('error'); }
  }

  function mondayLabel(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Resin Historicals — actual hours & units</h3>
        <span className="text-xs text-slate-400">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Past 8 weeks'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap sticky left-0 bg-slate-50">
                Team Member
              </th>
              {weeks.map(w => (
                <th key={w} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px]">
                  {mondayLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((m, mi) => (
              <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                <td className="px-4 py-1.5 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white">
                  {m.name}
                </td>
                {weeks.map(w => {
                  const a    = getActual(w, m.id);
                  const cpo  = a && a.hours > 0 && a.units > 0 && (m.hourlyRate > 0 || m.annualSalary > 0)
                    ? (m.payType === 'hourly' ? a.hours * m.hourlyRate : (m.annualSalary / 52) * (a.hours / 40)) / a.units
                    : null;
                  return (
                    <td key={w} className="px-1 py-1 text-center">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          value={a?.hours || ''}
                          placeholder="hrs"
                          min={0}
                          onChange={e => updateActual(w, m, 'hours', parseFloat(e.target.value) || 0)}
                          className="w-full text-center bg-white border border-slate-100 rounded px-1 py-0.5 text-xs hover:border-purple-300"
                        />
                        <input
                          type="number"
                          value={a?.units || ''}
                          placeholder="units"
                          min={0}
                          onChange={e => updateActual(w, m, 'units', parseFloat(e.target.value) || 0)}
                          className="w-full text-center bg-purple-50 border border-purple-100 rounded px-1 py-0.5 text-xs hover:border-purple-300"
                        />
                        {cpo !== null && (
                          <span className="text-[10px] text-purple-500">${cpo.toFixed(2)} cpo</span>
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
      <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">
        Top row = hours worked · Bottom row = units completed · CPO auto-calculated from your rate above
      </p>
    </div>
  );
}

// ─── Local type for queue rows ─────────────────────────────────────────────────

interface ResinQueueRow {
  line_item_id:        string;
  shopify_order_number: string;
  line_item_title:     string;
  variant_title:       string | null;
  pf_status:           string | null;
  origin_location:     string | null;
  order_date:          string | null;
  quantity:            number;
}

