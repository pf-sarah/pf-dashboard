'use client';

import { useState, useEffect, useMemo } from 'react';

interface RosterMember {
  name: string;
  payType: 'hourly' | 'salary';
  hourlyRate: number;
  annualSalary: number;
  isManager?: boolean;
}

interface ActualRow {
  department: string;
  week_of: string;
  member_name: string;
  actual_hours: number;
  actual_orders: number;
}

interface DeptMetrics {
  ratio: number | null;
  cpo: number | null;
  orders: number;
  hours: number;
  cost: number;
  missingRates: string[];
}

interface PeriodMetrics {
  design:        DeptMetrics;
  preservation:  DeptMetrics;
  fulfillment:   DeptMetrics;
  combinedRatio: number | null;
  combinedCPO:   number | null;
}

export interface HistoricalMetrics {
  thisMonth: PeriodMetrics;
  lastMonth: PeriodMetrics;
  lastWeek:  PeriodMetrics;
  loading:   boolean;
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

function getMonthBounds(offsetMonths: number): { start: string; end: string } {
  const d = new Date();
  const firstDay = new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1);
  const lastDay  = new Date(d.getFullYear(), d.getMonth() + offsetMonths + 1, 0);
  return { start: isoDate(firstDay), end: isoDate(lastDay) };
}

function computeDeptMetrics(
  rows: ActualRow[],
  dept: string,
  weekStart: string,
  weekEnd: string,
  roster: RosterMember[]
): DeptMetrics {
  const deptRows = rows.filter(r =>
    r.department === dept &&
    r.week_of >= weekStart &&
    r.week_of <= weekEnd
  );

  // Aggregate by member
  const byMember: Record<string, { hours: number; orders: number }> = {};
  deptRows.forEach(r => {
    if (!byMember[r.member_name]) byMember[r.member_name] = { hours: 0, orders: 0 };
    byMember[r.member_name].hours  += r.actual_hours;
    byMember[r.member_name].orders += r.actual_orders;
  });

  let totalOrders = 0;
  let totalHours  = 0;
  let totalCost   = 0;
  const missingRates: string[] = [];

  // Include all roster members in cost calculation
  roster.forEach(m => {
    const data = byMember[m.name] ?? { hours: 0, orders: 0 };
    totalOrders += data.orders;
    totalHours  += data.hours;

    // Determine cost
    if (m.payType === 'salary') {
      if (m.annualSalary > 0) {
        // Pro-rate salary for the period (count weeks in range)
        const weeksInPeriod = deptRows
          .map(r => r.week_of)
          .filter((v, i, a) => a.indexOf(v) === i).length || 1;
        totalCost += (m.annualSalary / 52) * weeksInPeriod;
      } else {
        missingRates.push(m.name);
      }
    } else {
      if (m.hourlyRate > 0) {
        totalCost += data.hours * m.hourlyRate;
      } else if (data.hours > 0) {
        missingRates.push(m.name);
      }
    }
  });

  const ratio = totalOrders > 0 && totalHours > 0 ? totalHours / totalOrders : null;
  const cpo   = totalOrders > 0 && totalCost  > 0 ? totalCost  / totalOrders : null;

  return { ratio, cpo, orders: totalOrders, hours: totalHours, cost: totalCost, missingRates };
}

function computePeriod(
  rows: ActualRow[],
  weekStart: string,
  weekEnd: string,
  rosters: { design: RosterMember[]; preservation: RosterMember[]; fulfillment: RosterMember[] }
): PeriodMetrics {
  const design       = computeDeptMetrics(rows, 'design',       weekStart, weekEnd, rosters.design);
  const preservation = computeDeptMetrics(rows, 'preservation', weekStart, weekEnd, rosters.preservation);
  const fulfillment  = computeDeptMetrics(rows, 'fulfillment',  weekStart, weekEnd, rosters.fulfillment);

  // Combined ratio = sum of each dept ratio
  const ratios = [design.ratio, preservation.ratio, fulfillment.ratio].filter(r => r !== null) as number[];
  const combinedRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) : null;

  // Combined CPO = sum of each dept CPO
  const cpos = [design.cpo, preservation.cpo, fulfillment.cpo].filter(c => c !== null) as number[];
  const combinedCPO = cpos.length > 0 ? cpos.reduce((a, b) => a + b, 0) : null;

  return { design, preservation, fulfillment, combinedRatio, combinedCPO };
}

export function useHistoricalMetrics(
  location: 'Utah' | 'Georgia',
  rosters: { design: RosterMember[]; preservation: RosterMember[]; fulfillment: RosterMember[] }
): HistoricalMetrics {
  const [rows,    setRows]    = useState<ActualRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/actuals?location=${location}&type=team&weeks=100`)
      .then(r => r.json())
      .then((d: { teamActuals?: ActualRow[] }) => setRows(d.teamActuals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  const metrics = useMemo(() => {
    // This month: from first day of current month to today
    const thisMonth = getMonthBounds(0);
    // Last month: full previous month
    const lastMonth = getMonthBounds(-1);
    // Last week: Mon–Sun of previous week
    const lastWeekStart = isoDate(getMondayDate(-1));
    const lastWeekEnd   = isoDate(new Date(new Date(lastWeekStart + 'T12:00:00').getTime() + 6 * 86400000));

    return {
      thisMonth: computePeriod(rows, thisMonth.start, thisMonth.end, rosters),
      lastMonth: computePeriod(rows, lastMonth.start, lastMonth.end, rosters),
      lastWeek:  computePeriod(rows, lastWeekStart,   lastWeekEnd,   rosters),
      loading,
    };
  }, [rows, loading, rosters]); // eslint-disable-line react-hooks/exhaustive-deps

  return metrics;
}
