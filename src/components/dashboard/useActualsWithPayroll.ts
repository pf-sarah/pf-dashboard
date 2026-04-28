'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ActualRow {
  week_of:       string;
  member_name:   string;
  department:    string;
  location:      string;
  actual_hours:  number;
  actual_orders: number;
  hours_source?: string;
}

export interface PayrollRow {
  full_name:    string;
  department:   string;
  location:     string;
  gross_pay:    number;
  period_start: string;
  period_end:   string;
}

export interface EnrichedActual extends ActualRow {
  cost:      number;   // actual gross or estimate
  isActual:  boolean;  // true = came from Rippling payroll
}

// Returns true if a week (Mon) overlaps with a pay period
function weekOverlapsPeriod(weekOf: string, periodStart: string, periodEnd: string): boolean {
  // Week runs Sun–Sat (Sun = weekOf - 1 day, Sat = weekOf + 5 days)
  const mon = new Date(weekOf + 'T12:00:00');
  const sun = new Date(mon); sun.setDate(mon.getDate() - 1);
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  const pStart = new Date(periodStart + 'T12:00:00');
  const pEnd   = new Date(periodEnd   + 'T12:00:00');
  return sun <= pEnd && sat >= pStart;
}

// Get all weeks (Mon ISO) that a pay period overlaps
function weeksInPeriod(periodStart: string, periodEnd: string, allWeeks: string[]): string[] {
  return allWeeks.filter(w => weekOverlapsPeriod(w, periodStart, periodEnd));
}

export function useActualsWithPayroll(location: 'Utah' | 'Georgia') {
  const [actuals,  setActuals]  = useState<ActualRow[]>([]);
  const [payroll,  setPayroll]  = useState<PayrollRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch actuals
      const actualsRes = await fetch(`/api/actuals?location=${location}&type=team&weeks=100`);
      const actualsData = await actualsRes.json() as { teamActuals?: ActualRow[] };
      const rows = actualsData.teamActuals ?? [];
      setActuals(rows);

      // Fetch payroll for all depts — wide date range to cover all history
      const depts = ['Design', 'Preservation', 'Fulfillment'];
      const from = '2025-12-01';
      const to   = new Date().toISOString().split('T')[0];
      const payrollRows: PayrollRow[] = [];
      await Promise.all(depts.map(async dept => {
        const res = await fetch(`/api/admin/payroll-upload?location=${location}&department=${dept}&from=${from}&to=${to}`);
        const data = await res.json() as { rawRows?: PayrollRow[] };
        if (data.rawRows) payrollRows.push(...data.rawRows);
      }));
      setPayroll(payrollRows);
    } catch {}
    setLoading(false);
  }, [location]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Enrich actuals with payroll cost
  function enrich(rows: ActualRow[]): EnrichedActual[] {
    // Build a map of all weeks present in actuals
    const allWeeks = [...new Set(rows.map(r => r.week_of))].sort();

    // For each person+dept+period, calculate total hours across all weeks in that period
    // So we can split proportionally
    const periodHours: Record<string, number> = {};
    // key: `${name}|${dept}|${period_start}|${period_end}`
    for (const pr of payroll) {
      const key = `${pr.full_name}|${pr.department.toLowerCase()}|${pr.period_start}|${pr.period_end}`;
      if (!periodHours[key]) periodHours[key] = 0;
      const weeks = weeksInPeriod(pr.period_start, pr.period_end, allWeeks);
      for (const w of weeks) {
        const actual = rows.find(r =>
          r.member_name === pr.full_name &&
          r.department.toLowerCase() === pr.department.toLowerCase() &&
          r.week_of === w
        );
        periodHours[key] += actual?.actual_hours ?? 0;
      }
    }

    return rows.map(row => {
      // Find payroll records that overlap this week for this person+dept
      const matchingPayroll = payroll.filter(pr =>
        pr.full_name === row.member_name &&
        pr.department.toLowerCase() === row.department.toLowerCase() &&
        weekOverlapsPeriod(row.week_of, pr.period_start, pr.period_end)
      );

      if (matchingPayroll.length > 0 && row.actual_hours > 0) {
        // Allocate gross pay proportionally by hours
        let allocatedCost = 0;
        for (const pr of matchingPayroll) {
          const key = `${pr.full_name}|${pr.department.toLowerCase()}|${pr.period_start}|${pr.period_end}`;
          const totalHoursInPeriod = periodHours[key] ?? 0;
          if (totalHoursInPeriod > 0) {
            allocatedCost += (row.actual_hours / totalHoursInPeriod) * pr.gross_pay;
          } else {
            // No hours data — split evenly across weeks in period
            const weeks = weeksInPeriod(pr.period_start, pr.period_end, allWeeks);
            allocatedCost += pr.gross_pay / Math.max(1, weeks.length);
          }
        }
        return { ...row, cost: allocatedCost, isActual: true };
      }

      // Fall back to rate estimate — will be 0 if no rate set (handled by caller)
      return { ...row, cost: 0, isActual: false };
    });
  }

  return { actuals, payroll, enrichedActuals: enrich(actuals), loading, refresh: fetchAll };
}
