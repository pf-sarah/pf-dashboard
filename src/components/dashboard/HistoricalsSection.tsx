'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  payType: 'hourly' | 'salary';
  hourlyRate: number;
  annualSalary: number;
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
  ordersLabel: string; // e.g. "frames" or "orders"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// All Monday ISO dates from 2025-12-29 through last complete week
function getAllWeeks(): string[] {
  const start = new Date('2025-12-29T12:00:00');
  const lastMonday = getMondayDate(-1); // last complete week
  const weeks: string[] = [];
  const cur = new Date(start);
  while (cur <= lastMonday) {
    weeks.push(isoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks; // oldest first
}

// ─── HistoricalsSection ───────────────────────────────────────────────────────

export function HistoricalsSection({ department, location, members, ordersLabel }: HistoricalsSectionProps) {
  const [actuals, setActuals] = useState<ActualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, { hours: number; orders: number }>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const allWeeks = useMemo(() => getAllWeeks(), []);

  // Fetch all actuals for this dept + location (no week limit)
  const fetchActuals = useCallback(() => {
    fetch(`/api/actuals?location=${location}&type=team&weeks=100`)
      .then(r => r.json())
      .then((d: { teamActuals?: ActualRow[] }) => {
        setActuals((d.teamActuals ?? []).filter(r => r.member_name && department === department));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location, department]);

  useEffect(() => {
    setLoading(true);
    fetchActuals();
  }, [fetchActuals]);

  // Get entry for a week/member (local edit > supabase > zero)
  function getEntry(weekOf: string, name: string): { hours: number; orders: number } {
    if (localEdits[weekOf]?.[name]) return localEdits[weekOf][name];
    const row = actuals.find(r => r.week_of === weekOf && r.member_name === name && (r as ActualRow & { department?: string }).department === department);
    // department filter done server-side, so just match name+week
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
            memberName: name,
            actualHours: updated.hours,
            actualOrders: updated.orders,
          }),
        });
        fetchActuals();
      } catch {}
      setSavingKey(null);
    }, 800);
  }

  // CPO calculation per member per week
  function getCPO(member: TeamMember, hours: number, orders: number): number | null {
    if (orders === 0) return null;
    const cost = member.payType === 'salary' ? member.annualSalary / 52 : hours * member.hourlyRate;
    if (cost === 0) return null;
    return cost / orders;
  }

  const hasRates = members.some(m =>
    (m.payType === 'hourly' && m.hourlyRate > 0) || (m.payType === 'salary' && m.annualSalary > 0)
  );

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map: Record<string, {
      weeks: string[];
      byMember: Record<string, { hours: number; orders: number; cost: number }>;
      totalOrders: number; totalHours: number; totalCost: number;
    }> = {};

    allWeeks.forEach(w => {
      const mk = getMonthKey(w);
      if (!map[mk]) map[mk] = { weeks: [], byMember: {}, totalOrders: 0, totalHours: 0, totalCost: 0 };
      map[mk].weeks.push(w);

      members.forEach(m => {
        const e = getEntry(w, m.name);
        if (!map[mk].byMember[m.name]) map[mk].byMember[m.name] = { hours: 0, orders: 0, cost: 0 };
        const cost = m.payType === 'salary' ? m.annualSalary / 52 : e.hours * m.hourlyRate;
        map[mk].byMember[m.name].hours  += e.hours;
        map[mk].byMember[m.name].orders += e.orders;
        map[mk].byMember[m.name].cost   += cost;
        map[mk].totalOrders += e.orders;
        map[mk].totalHours  += e.hours;
        map[mk].totalCost   += cost;
      });
    });

    return map;
  }, [allWeeks, actuals, localEdits, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = getMondayDate(0);

  if (loading) {
    return <div className="text-xs text-slate-400 p-4">Loading historicals…</div>;
  }

  return (
    <div className="space-y-6">

      {/* ── WEEKLY TABLE ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">All weeks — {department} · {location}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Oldest → newest (scroll right). Amber = missing actuals. Click any cell to edit — auto-saves.
            </p>
          </div>
          {savingKey && <span className="text-xs text-slate-400 italic">Saving…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[140px]">
                  {department.charAt(0).toUpperCase() + department.slice(1)} member
                </th>
                {allWeeks.map(w => {
                  const mk = getMonthKey(w);
                  const isFirstOfMonth = allWeeks.filter(x => getMonthKey(x) === mk)[0] === w;
                  return (
                    <th key={w} className={`px-1 py-2 text-center font-medium whitespace-nowrap min-w-[72px] ${
                      isFirstOfMonth ? 'border-l-2 border-slate-200' : ''
                    } text-slate-500`}>
                      <div>{fmtWeek(w)}</div>
                      {isFirstOfMonth && <div className="text-[9px] text-indigo-400 font-semibold">{mk.split(' ')[0]}</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((m, mi) => (
                <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                    <div className="font-medium text-slate-700">{m.name}</div>
                    {m.payType === 'salary' && <div className="text-[10px] text-amber-600">salary</div>}
                  </td>
                  {allWeeks.map(w => {
                    const weekDate = new Date(w + 'T12:00:00');
                    const isPast = weekDate < today;
                    const e = getEntry(w, m.name);
                    const hasData = e.hours > 0 || e.orders > 0;
                    const isMissing = isPast && !hasData;
                    const cpo = getCPO(m, e.hours, e.orders);
                    const isFirstOfMonth = allWeeks.filter(x => getMonthKey(x) === getMonthKey(w))[0] === w;
                    const isSaving = savingKey === `${w}:${m.name}`;
                    return (
                      <td key={w} className={`px-1 py-1 text-center ${
                        isMissing ? 'bg-amber-50' : ''
                      } ${isFirstOfMonth ? 'border-l-2 border-slate-100' : ''} ${isSaving ? 'opacity-60' : ''}`}>
                        <div className="flex flex-col gap-0.5 items-center">
                          <input
                            type="number" min="0"
                            value={e.orders || ''}
                            placeholder={isMissing ? '!' : '0'}
                            title={`${ordersLabel} — week of ${w}`}
                            onChange={ev => handleEdit(w, m.name, 'orders', parseInt(ev.target.value) || 0)}
                            className={`w-11 border rounded px-1 py-0.5 text-center font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 ${
                              isMissing ? 'border-amber-300 text-amber-700' : 'border-slate-200 text-indigo-700'
                            }`}
                          />
                          <input
                            type="number" min="0" step="0.5"
                            value={e.hours || ''}
                            placeholder="h"
                            title={`Hours — week of ${w}`}
                            onChange={ev => handleEdit(w, m.name, 'hours', parseFloat(ev.target.value) || 0)}
                            className={`w-11 border rounded px-1 py-0.5 text-center bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 ${
                              isMissing ? 'border-amber-200 text-amber-500' : 'border-slate-200 text-slate-400'
                            }`}
                          />
                          {hasRates && cpo !== null && (
                            <span className="text-[9px] text-amber-600">{fmt$(cpo)}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Week totals row */}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="sticky left-0 bg-slate-50 px-4 py-2 text-xs text-slate-600">Week total</td>
                {allWeeks.map(w => {
                  const totalOrders = members.reduce((s, m) => s + getEntry(w, m.name).orders, 0);
                  const totalCost   = members.reduce((s, m) => {
                    const e = getEntry(w, m.name);
                    return s + (m.payType === 'salary' ? m.annualSalary / 52 : e.hours * m.hourlyRate);
                  }, 0);
                  const weekCPO = totalOrders > 0 && totalCost > 0 ? totalCost / totalOrders : null;
                  const isFirstOfMonth = allWeeks.filter(x => getMonthKey(x) === getMonthKey(w))[0] === w;
                  return (
                    <td key={w} className={`px-1 py-2 text-center ${isFirstOfMonth ? 'border-l-2 border-slate-200' : ''}`}>
                      {totalOrders > 0 ? (
                        <>
                          <div className="text-indigo-700">{totalOrders}</div>
                          {hasRates && weekCPO !== null && <div className="text-[9px] text-amber-600">{fmt$(weekCPO)}</div>}
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

      {/* ── MONTHLY SUMMARY ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Monthly summary</h3>
          <p className="text-xs text-slate-400 mt-0.5">Total {ordersLabel}, hours, ratio, and CPO per month.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 whitespace-nowrap min-w-[140px]">Member</th>
                {Object.keys(monthlyData).map(mk => (
                  <th key={mk} className="px-3 py-2 text-center font-medium text-slate-500 whitespace-nowrap min-w-[100px]">
                    {mk.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, mi) => (
                <tr key={m.id} className={`border-b border-slate-50 ${mi % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{m.name}</td>
                  {Object.entries(monthlyData).map(([mk, md]) => {
                    const d = md.byMember[m.name];
                    if (!d || d.orders === 0) return <td key={mk} className="px-3 py-2 text-center text-slate-200">—</td>;
                    const ratio = d.hours > 0 && d.orders > 0 ? d.hours / d.orders : null;
                    const cpo   = d.cost > 0 && d.orders > 0 ? d.cost / d.orders : null;
                    return (
                      <td key={mk} className="px-3 py-2 text-center">
                        <div className="font-semibold text-indigo-700">{d.orders}</div>
                        <div className="text-slate-400">{Math.round(d.hours)}h</div>
                        {ratio !== null && (
                          <div className={`text-[10px] ${ratio <= 1.0 ? 'text-green-700' : ratio <= 1.8 ? 'text-amber-700' : 'text-red-700'}`}>
                            {ratio.toFixed(2)}
                          </div>
                        )}
                        {hasRates && cpo !== null && <div className="text-[10px] text-amber-600">{fmt$(cpo)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Monthly team totals */}
              <tr className="border-t-2 border-slate-200 bg-indigo-50/30 font-semibold">
                <td className="sticky left-0 bg-indigo-50/30 px-4 py-2 text-slate-700">Month total</td>
                {Object.entries(monthlyData).map(([mk, md]) => {
                  const cpo = md.totalOrders > 0 && md.totalCost > 0 ? md.totalCost / md.totalOrders : null;
                  const ratio = md.totalOrders > 0 && md.totalHours > 0 ? md.totalHours / md.totalOrders : null;
                  return (
                    <td key={mk} className="px-3 py-2 text-center">
                      <div className="text-indigo-700">{md.totalOrders || '—'}</div>
                      {ratio !== null && (
                        <div className={`text-[10px] ${ratio <= 1.0 ? 'text-green-700' : ratio <= 1.8 ? 'text-amber-700' : 'text-red-700'}`}>
                          {ratio.toFixed(2)} h/ord
                        </div>
                      )}
                      {hasRates && cpo !== null && (
                        <div className="text-[10px] font-semibold text-amber-700">{fmt$(cpo)} CPO</div>
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
