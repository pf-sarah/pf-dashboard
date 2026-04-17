'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

interface TeamMember {
  id: string;
  name: string;
  payType: 'hourly' | 'salary';
  hourlyRate: number;
  annualSalary: number;
  isManager?: boolean;
}

interface ActualRow {
  week_of: string;
  member_name: string;
  actual_hours: number;
  actual_orders: number;
}

interface HistoricalsSectionProps {
  department: 'design' | 'preservation' | 'fulfillment';
  location: 'Utah' | 'Georgia';
  members: TeamMember[];
  ordersLabel: string;
  onRatioUpdate?: (memberId: string, ratio: number) => void;
}

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function getMondayDate(offsetWeeks: number): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtWeek(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthKey(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// All Monday ISO dates from 2025-12-29 through current week (inclusive)
function getAllWeeks(): string[] {
  const start = new Date('2025-12-29T12:00:00');
  const thisMonday = getMondayDate(0); // current week Monday
  const weeks: string[] = [];
  const cur = new Date(start);
  while (cur <= thisMonday) {
    weeks.push(isoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

export function HistoricalsSection({ department, location, members, ordersLabel, onRatioUpdate }: HistoricalsSectionProps) {
  const [actuals, setActuals] = useState<ActualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, { hours: number; orders: number }>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [managerHours, setManagerHours] = useState<Record<string, number>>({}); // extra mgr hours (non-production)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const allWeeks = useMemo(() => getAllWeeks(), []);
  const today = getMondayDate(0);

  const fetchActuals = useCallback(() => {
    fetch(`/api/actuals?location=${location}&type=team&weeks=100`)
      .then(r => r.json())
      .then((d: { teamActuals?: ActualRow[] }) => {
        const rows = d.teamActuals ?? [];
        setActuals(rows);
        // Auto-update roster ratios from last 4 weeks of actuals
        if (onRatioUpdate) {
          const today = new Date().toISOString().split('T')[0];
          members.forEach(m => {
            const last4 = rows
              .filter(r => r.week_of < today && r.member_name === m.name)
              .sort((a, b) => b.week_of.localeCompare(a.week_of))
              .slice(0, 4);
            const totalHours  = last4.reduce((s, r) => s + r.actual_hours,  0);
            const totalOrders = last4.reduce((s, r) => s + r.actual_orders, 0);
            if (totalOrders > 0 && totalHours > 0) {
              const ratio = Math.round((totalHours / totalOrders) * 100) / 100;
              onRatioUpdate(m.id, ratio);
            }
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location, department, members, onRatioUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    setLocalEdits({});
    fetchActuals();
  }, [fetchActuals]);

  function getEntry(weekOf: string, name: string): { hours: number; orders: number } {
    if (localEdits[weekOf]?.[name]) return localEdits[weekOf][name];
    const match = actuals.find(r => r.week_of === weekOf && r.member_name === name);
    return { hours: match?.actual_hours ?? 0, orders: match?.actual_orders ?? 0 };
  }

  function handleEdit(weekOf: string, name: string, field: 'hours' | 'orders', val: number) {
    const existing = getEntry(weekOf, name);
    const updated = { ...existing, [field]: val };
    setLocalEdits(prev => ({
      ...prev,
      [weekOf]: { ...(prev[weekOf] ?? {}), [name]: updated },
    }));
    const key = `${weekOf}:${name}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      setSavingKey(key);
      try {
        await fetch('/api/actuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'team', location, weekOf, department,
            memberName: name, actualHours: updated.hours, actualOrders: updated.orders,
          }),
        });
        fetchActuals();
      } catch {}
      setSavingKey(null);
    }, 800);
  }

  // Weekly cost for a member
  // Manager: full weekly cost regardless of production hours
  // Non-manager: cost = hours worked * hourly rate (or salary/52)
  function getMemberWeeklyCost(m: TeamMember, productionHours: number, weekOf: string): number {
    if (m.isManager) {
      // Full weekly cost: salary/52 or (production hours + extra mgr hours) * rate
      if (m.payType === 'salary') return m.annualSalary / 52;
      const extraHrs = managerHours[`${weekOf}:${m.name}`] ?? 0;
      return (productionHours + extraHrs) * m.hourlyRate;
    }
    if (m.payType === 'salary') return m.annualSalary / 52;
    return productionHours * m.hourlyRate;
  }

  const hasRates = members.some(m =>
    (m.payType === 'hourly' && m.hourlyRate > 0) || (m.payType === 'salary' && m.annualSalary > 0)
  );

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map: Record<string, {
      byMember: Record<string, { hours: number; orders: number; cost: number }>;
      totalOrders: number; totalCost: number; totalHours: number;
    }> = {};
    allWeeks.forEach(w => {
      const mk = getMonthKey(w);
      if (!map[mk]) map[mk] = { byMember: {}, totalOrders: 0, totalCost: 0, totalHours: 0 };
      members.forEach(m => {
        const e = getEntry(w, m.name);
        const cost = getMemberWeeklyCost(m, e.hours, w);
        if (!map[mk].byMember[m.name]) map[mk].byMember[m.name] = { hours: 0, orders: 0, cost: 0 };
        map[mk].byMember[m.name].hours  += e.hours;
        map[mk].byMember[m.name].orders += e.orders;
        map[mk].byMember[m.name].cost   += cost;
        map[mk].totalOrders += e.orders;
        map[mk].totalCost   += cost;
        map[mk].totalHours  += e.hours;
      });
    });
    return map;
  }, [allWeeks, actuals, localEdits, members, managerHours]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-xs text-slate-400 p-4">Loading historicals…</div>;

  return (
    <div className="space-y-6">

      {/* ── WEEKLY TABLE ── */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">All weeks — {department} · {location}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Oldest → newest. <span className="text-amber-600">Amber</span> = missing actuals. Click any cell to edit — auto-saves.
            </p>
          </div>
          {savingKey && <span className="text-xs text-slate-400 italic">Saving…</span>}
        </div>

        <style>{`
          .hist-input::-webkit-inner-spin-button,
          .hist-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          .hist-input { -moz-appearance: textfield; }
          .hist-cell:focus-within { background: #eef2ff; }
        `}</style>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[150px] border-b border-r border-slate-200">
                  Member
                </th>
                {allWeeks.map(w => {
                  const mk = getMonthKey(w);
                  const isFirst = allWeeks.filter(x => getMonthKey(x) === mk)[0] === w;
                  return (
                    <th key={w} className={`px-2 py-1.5 text-center whitespace-nowrap min-w-[68px] border-b border-slate-200 ${isFirst ? 'border-l-2 border-l-slate-300' : 'border-l border-l-slate-100'}`}>
                      <div className="font-medium text-slate-600">{fmtWeek(w)}</div>
                      {isFirst && <div className="text-[9px] text-indigo-500 font-semibold">{mk.split(' ')[0].toUpperCase()}</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((m, mi) => (
                <tr key={m.id} className={`${mi % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap border-r border-slate-200 border-b border-b-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{m.name}</span>
                      {m.isManager && <span className="text-[9px] bg-violet-100 text-violet-700 rounded px-1 py-px font-semibold">MGR</span>}
                    </div>
                    {m.payType === 'salary' && <div className="text-[10px] text-amber-600">salary</div>}
                  </td>
                  {allWeeks.map(w => {
                    const isPast = new Date(w + 'T12:00:00') <= today;
                    const e = getEntry(w, m.name);
                    const hasData = e.hours > 0 || e.orders > 0;
                    const isMissing = isPast && !hasData;
                    const isSaving = savingKey === `${w}:${m.name}`;
                    const isFirst = allWeeks.filter(x => getMonthKey(x) === getMonthKey(w))[0] === w;
                    return (
                      <td key={w}
                        className={`hist-cell p-0 border-b border-b-slate-100 ${isFirst ? 'border-l-2 border-l-slate-200' : 'border-l border-l-slate-100'} ${isMissing ? 'bg-amber-50' : ''} ${isSaving ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col">
                          {/* Orders input */}
                          <input
                            type="number" min="0"
                            value={e.orders > 0 ? e.orders : ''}
                            placeholder=""
                            onChange={ev => handleEdit(w, m.name, 'orders', parseInt(ev.target.value) || 0)}
                            className={`hist-input w-full px-2 py-1 text-center text-[11px] font-semibold bg-transparent border-none outline-none focus:bg-indigo-50 ${isMissing && !hasData ? 'text-amber-400' : 'text-indigo-700'}`}
                          />
                          {/* Hours input */}
                          <input
                            type="number" min="0" step="0.5"
                            value={e.hours > 0 ? e.hours : ''}
                            placeholder=""
                            onChange={ev => handleEdit(w, m.name, 'hours', parseFloat(ev.target.value) || 0)}
                            className={`hist-input w-full px-2 py-1 text-center text-[10px] bg-transparent border-none outline-none border-t border-t-slate-100 focus:bg-indigo-50 ${isMissing && !hasData ? 'text-amber-300' : 'text-slate-400'}`}
                          />
                          {/* Manager extra hours */}
                          {m.isManager && m.payType === 'hourly' && (
                            <input
                              type="number" min="0" step="0.5"
                              value={managerHours[`${w}:${m.name}`] ?? ''}
                              placeholder="mgr h"
                              title="Additional manager hours (non-production)"
                              onChange={ev => setManagerHours(prev => ({ ...prev, [`${w}:${m.name}`]: parseFloat(ev.target.value) || 0 }))}
                              className="hist-input w-full px-2 py-0.5 text-center text-[9px] bg-violet-50 border-none outline-none border-t border-t-violet-100 text-violet-500 placeholder:text-violet-300"
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Week totals */}
              <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600 border-r border-slate-200">Week total</td>
                {allWeeks.map(w => {
                  const totalOrders = members.filter(m => !m.isManager).reduce((s, m) => s + getEntry(w, m.name).orders, 0)
                    + members.filter(m => m.isManager).reduce((s, m) => s + getEntry(w, m.name).orders, 0);
                  const totalCost = members.reduce((s, m) => {
                    const e = getEntry(w, m.name);
                    return s + getMemberWeeklyCost(m, e.hours, w);
                  }, 0);
                  const teamCPO = totalOrders > 0 && totalCost > 0 ? totalCost / totalOrders : null;
                  const isFirst = allWeeks.filter(x => getMonthKey(x) === getMonthKey(w))[0] === w;
                  return (
                    <td key={w} className={`px-2 py-2 text-center ${isFirst ? 'border-l-2 border-l-slate-300' : 'border-l border-l-slate-100'}`}>
                      {totalOrders > 0 ? (
                        <>
                          <div className="text-indigo-700">{totalOrders}</div>
                          {hasRates && teamCPO !== null && <div className="text-[9px] text-amber-600 font-semibold">{fmt$(teamCPO)}</div>}
                        </>
                      ) : <span className="text-slate-200">—</span>}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MONTHLY SUMMARY ── */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Monthly summary</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Total {ordersLabel}, hours, ratio. CPO = total labor cost (incl. manager) ÷ total {ordersLabel}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[150px] border-r border-slate-200">Member</th>
                {Object.keys(monthlyData).map(mk => (
                  <th key={mk} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[90px] border-l border-slate-100">
                    {mk.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, mi) => (
                <tr key={m.id} className={`border-b border-slate-100 ${mi % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap border-r border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{m.name}</span>
                      {m.isManager && <span className="text-[9px] bg-violet-100 text-violet-700 rounded px-1 py-px font-semibold">MGR</span>}
                    </div>
                  </td>
                  {Object.entries(monthlyData).map(([mk, md]) => {
                    const d = md.byMember[m.name];
                    if (!d || (d.orders === 0 && d.hours === 0)) return <td key={mk} className="px-3 py-2 text-center text-slate-200 border-l border-slate-100">—</td>;
                    const ratio = d.hours > 0 && d.orders > 0 ? d.hours / d.orders : null;
                    return (
                      <td key={mk} className="px-3 py-2 text-center border-l border-slate-100">
                        {d.orders > 0 && <div className="font-semibold text-indigo-700">{d.orders}</div>}
                        {d.hours > 0 && <div className="text-slate-400">{Math.round(d.hours * 10) / 10}h</div>}
                        {!m.isManager && ratio !== null && (
                          <div className={`text-[10px] ${ratio <= 1.0 ? 'text-green-700' : ratio <= 2.0 ? 'text-amber-700' : 'text-red-700'}`}>
                            {ratio.toFixed(2)} h/ord
                          </div>
                        )}
                        {m.isManager && <div className="text-[9px] text-violet-500 italic">mgr</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Monthly team totals row */}
              <tr className="border-t-2 border-slate-200 bg-indigo-50/30 font-semibold">
                <td className="sticky left-0 bg-indigo-50/30 px-4 py-2 text-slate-700 border-r border-slate-200">Month total</td>
                {Object.entries(monthlyData).map(([mk, md]) => {
                  const cpo   = md.totalOrders > 0 && md.totalCost > 0 ? md.totalCost / md.totalOrders : null;
                  const ratio = md.totalOrders > 0 && md.totalHours > 0 ? md.totalHours / md.totalOrders : null;
                  return (
                    <td key={mk} className="px-3 py-2 text-center border-l border-slate-100">
                      <div className="text-indigo-700">{md.totalOrders || '—'}</div>
                      {ratio !== null && (
                        <div className={`text-[10px] ${ratio <= 1.0 ? 'text-green-700' : ratio <= 2.0 ? 'text-amber-700' : 'text-red-700'}`}>
                          {ratio.toFixed(2)} h/ord
                        </div>
                      )}
                      {hasRates && cpo !== null && (
                        <div className="text-[11px] font-semibold text-amber-700">{fmt$(cpo)}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
