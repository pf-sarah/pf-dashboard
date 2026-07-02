'use client';

import { useState, useEffect, useMemo } from 'react';
import { getMondayDate } from '@/lib/weekDates';
import { DEPARTMENT_MANAGERS, getSalaryMgrCostForWeeks } from '@/lib/managers';

export interface RosterMember {
  name: string;
  payType: 'hourly' | 'salary';
  hourlyRate: number;
  annualSalary: number;
  isManager?: boolean;
  role?: 'specialist' | 'senior' | 'master';
  scheduledHours?: Record<string, number>; // isoMonday -> scheduled hours
  ratio?: number;
  mgrTotalHours?: Record<string, number>;  // isoMonday -> total hours (managers only)
}

interface ActualRow {
  department: string;
  week_of: string;
  member_name: string;
  actual_hours: number;
  actual_orders: number;
}

// Rippling payroll data: personName → total gross pay for the period
export type PayrollMap = Record<string, number>;

// Manager pay/role definitions live in src/lib/managers.ts (single source of
// truth shared with kpis/route.ts, scorecard/route.ts, and
// useActualsWithPayroll.ts). Update that file when a manager changes.

function getSalaryManagerCost(location: string, dept: string, weekStart: string, weekEnd: string): number {
  const weeks = getWeeksInRange(weekStart, weekEnd);
  return getSalaryMgrCostForWeeks(DEPARTMENT_MANAGERS, location, dept, weeks);
}

export interface DeptMetrics {
  ratio: number | null;
  cpo: number | null;
  orders: number;
  hours: number;
  cost: number;
  missingRates: string[];
  goalRatio: number | null;
  goalCPO: number | null;
  // New: which people had actual Rippling data vs estimated
  actualPayroll: string[];   // names with real payroll data
  estimatedPayroll: string[]; // names using rate estimate
}

export interface PeriodMetrics {
  design:        DeptMetrics;
  preservation:  DeptMetrics;
  fulfillment:   DeptMetrics;
  combinedRatio: number | null;
  combinedCPO:   number | null;
  combinedGoalRatio: number | null;
  combinedGoalCPO:   number | null;
  // True if ALL cost data came from Rippling (no estimates)
  allActual: boolean;
  // True if ANY cost data came from Rippling
  anyActual: boolean;
}

export interface HistoricalMetrics {
  thisMonth:      PeriodMetrics;
  lastMonth:      PeriodMetrics;
  lastWeek:       PeriodMetrics;
  thisMonthGoal:  PeriodMetrics;
  nextMonthGoal:  PeriodMetrics;
  loading:        boolean;
}

const ROLE_RATIOS: Record<string, Record<string, number>> = {
  design:       { specialist: 2.00, senior: 1.60, master: 1.20 },
  preservation: { specialist: 1.00, senior: 0.80, master: 0.60 },
  fulfillment:  { specialist: 0.50, senior: 0.40, master: 0.30 },
};

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMonthBounds(offsetMonths: number): { start: string; end: string } {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1);
  const last  = new Date(d.getFullYear(), d.getMonth() + offsetMonths + 1, 0);
  // For current month: cap end at last completed Monday (don't include current week)
  if (offsetMonths === 0) {
    const lastMon = getMondayDate(-1); // last completed week's Monday
    const lastMonStr = isoDate(lastMon);
    // end = Sunday of last completed week = lastMon + 6 days
    const lastSun = new Date(lastMon);
    lastSun.setDate(lastMon.getDate() + 6);
    const cappedEnd = isoDate(lastSun) < isoDate(last) ? isoDate(lastSun) : isoDate(last);
    return { start: isoDate(first), end: cappedEnd };
  }
  return { start: isoDate(first), end: isoDate(last) };
}

function getWeeksInRange(start: string, end: string): string[] {
  const weeks: string[] = [];
  const startDate = new Date(start + 'T12:00:00');
  const dow = startDate.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const firstMon = new Date(startDate);
  firstMon.setDate(startDate.getDate() + diff);
  if (isoDate(firstMon) < start) firstMon.setDate(firstMon.getDate() + 7);
  const cur = new Date(firstMon);
  while (isoDate(cur) <= end) {
    weeks.push(isoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function computeActualDeptMetrics(
  rows: ActualRow[],
  dept: string,
  weekStart: string,
  weekEnd: string,
  roster: RosterMember[],
  payroll: PayrollMap,  // gross pay per person for this period from Rippling
  location: string
): DeptMetrics {
  const deptRows = rows.filter(r =>
    r.department === dept && r.week_of >= weekStart && r.week_of <= weekEnd
  );
  const byMember: Record<string, { hours: number; orders: number }> = {};
  deptRows.forEach(r => {
    if (!byMember[r.member_name]) byMember[r.member_name] = { hours: 0, orders: 0 };
    byMember[r.member_name].hours  += r.actual_hours;
    byMember[r.member_name].orders += r.actual_orders;
  });

  let totalOrders = 0, totalHours = 0, totalCost = 0;
  const missingRates: string[] = [];
  const actualPayroll: string[] = [];
  const estimatedPayroll: string[] = [];
  const weeksInPeriod = new Set(deptRows.map(r => r.week_of)).size || 1;

  // Orders and hours: sum from ALL actuals rows (includes flex workers not on roster)
  Object.values(byMember).forEach(data => {
    totalOrders += data.orders;
    totalHours  += data.hours;
  });

  // Cost: use weekly_labor_cost totals directly (payroll map = sum of gross pay per person)
  // This correctly handles flex workers, mid-month joiners, etc.
  const payrollTotal = Object.values(payroll).reduce((s, v) => s + v, 0);
  if (payrollTotal > 0) {
    totalCost += payrollTotal;
    roster.forEach(m => { if (payroll[m.name]) actualPayroll.push(m.name); else estimatedPayroll.push(m.name); });
  } else {
    // Fallback to roster estimates if no payroll data
    roster.forEach(m => {
      if (m.payType === 'salary' && m.annualSalary > 0) {
        totalCost += (m.annualSalary / 52) * weeksInPeriod;
        estimatedPayroll.push(m.name);
      } else if (m.hourlyRate > 0) {
        const data = byMember[m.name] ?? { hours: 0, orders: 0 };
        totalCost += data.hours * m.hourlyRate;
        estimatedPayroll.push(m.name);
      }
    });
  }

  // Add salary manager cost (not in weekly_labor_cost)
  totalCost += getSalaryManagerCost(location, dept, weekStart, weekEnd);

  const ratio = totalOrders > 0 && totalHours > 0 ? totalHours / totalOrders : null;
  const cpo   = totalOrders > 0 && totalCost  > 0 ? totalCost  / totalOrders : null;

  // Goal calculation (unchanged)
  const roleRatios = ROLE_RATIOS[dept] ?? {};
  const weeksList = getWeeksInRange(weekStart, weekEnd);
  let goalNumerator = 0, goalDenominator = 0;
  let goalTotalOrders = 0, goalTotalCost = 0;

  roster.filter(m => !m.isManager).forEach(m => {
    const roleExpect = roleRatios[m.role ?? 'specialist'] ?? 999;
    const currentRatio = byMember[m.name] && byMember[m.name].hours > 0 && byMember[m.name].orders > 0
      ? byMember[m.name].hours / byMember[m.name].orders
      : roleExpect;
    const goalRatio = Math.min(currentRatio, roleExpect);
    const scheduledH = weeksList.reduce((s, w) => s + (m.scheduledHours?.[w] ?? 0), 0) || byMember[m.name]?.hours || 0;
    if (scheduledH > 0) {
      goalNumerator   += goalRatio * scheduledH;
      goalDenominator += scheduledH;
      const expectedOrders = goalRatio > 0 ? scheduledH / goalRatio : 0;
      goalTotalOrders += expectedOrders;
      const cost = m.payType === 'salary' ? (m.annualSalary / 52) * weeksInPeriod : scheduledH * m.hourlyRate;
      goalTotalCost += cost;
    }
  });
  roster.filter(m => m.isManager).forEach(m => {
    const cost = m.payType === 'salary' ? (m.annualSalary / 52) * weeksInPeriod
      : (weeksList.reduce((s, w) => s + (m.mgrTotalHours?.[w] ?? 0), 0) +
         weeksList.reduce((s, w) => s + (m.scheduledHours?.[w] ?? 0), 0)) * m.hourlyRate;
    goalTotalCost += cost;
  });

  const goalRatio = goalDenominator > 0 ? goalNumerator / goalDenominator : null;
  const goalCPO   = goalTotalOrders > 0 && goalTotalCost > 0 ? goalTotalCost / goalTotalOrders : null;

  return { ratio, cpo, orders: totalOrders, hours: totalHours, cost: totalCost, missingRates, goalRatio, goalCPO, actualPayroll, estimatedPayroll };
}

function computeScheduledDeptGoal(
  dept: string,
  weekStart: string,
  weekEnd: string,
  roster: RosterMember[]
): DeptMetrics {
  const roleRatios = ROLE_RATIOS[dept] ?? {};
  const weeksInRange = getWeeksInRange(weekStart, weekEnd);
  let goalNumerator = 0, goalDenominator = 0;
  let goalTotalOrders = 0, goalTotalCost = 0, goalTotalHours = 0;
  const missingRates: string[] = [];

  roster.filter(m => !m.isManager).forEach(m => {
    const roleExpect = roleRatios[m.role ?? 'specialist'] ?? 999;
    const goalRatio  = Math.min(m.ratio ?? roleExpect, roleExpect);
    let scheduledH = 0;
    weeksInRange.forEach(w => {
      scheduledH += m.scheduledHours?.[w] ?? 0;
    });
    if (scheduledH === 0) return;
    goalTotalHours += scheduledH;
    goalNumerator   += goalRatio * scheduledH;
    goalDenominator += scheduledH;
    const expectedOrders = goalRatio > 0 ? scheduledH / goalRatio : 0;
    goalTotalOrders += expectedOrders;
    const cost = m.payType === 'salary'
      ? (m.annualSalary / 52) * weeksInRange.length
      : scheduledH * m.hourlyRate;
    goalTotalCost += cost;
    if (m.hourlyRate === 0 && m.annualSalary === 0) missingRates.push(m.name);
  });
  roster.filter(m => m.isManager).forEach(m => {
    const totalH = weeksInRange.reduce((s, w) => {
      return s + (m.mgrTotalHours?.[w] ?? m.scheduledHours?.[w] ?? 0);
    }, 0);
    const prodH = weeksInRange.reduce((s, w) => s + (m.scheduledHours?.[w] ?? 0), 0);
    const roleRatiosLocal = ROLE_RATIOS[dept] ?? {};
    const goalRatio  = Math.min(m.ratio ?? (roleRatiosLocal['master'] ?? 999), roleRatiosLocal['master'] ?? 999);
    goalTotalOrders += goalRatio > 0 ? prodH / goalRatio : 0;
    const cost = m.payType === 'salary'
      ? (m.annualSalary / 52) * weeksInRange.length
      : totalH * m.hourlyRate;
    goalTotalCost += cost;
  });

  const goalRatio = goalDenominator > 0 ? goalNumerator / goalDenominator : null;
  const goalCPO   = goalTotalOrders > 0 && goalTotalCost > 0 ? goalTotalCost / goalTotalOrders : null;

  return { ratio: null, cpo: null, orders: 0, hours: goalTotalHours, cost: goalTotalCost, missingRates, goalRatio, goalCPO, actualPayroll: [], estimatedPayroll: [] };
}

function buildPeriod(
  rows: ActualRow[],
  weekStart: string,
  weekEnd: string,
  rosters: { design: RosterMember[]; preservation: RosterMember[]; fulfillment: RosterMember[] },
  payrollByDept: { design: PayrollMap; preservation: PayrollMap; fulfillment: PayrollMap; ga: PayrollMap },
  location: string
): PeriodMetrics {
  const design       = computeActualDeptMetrics(rows, 'design',       weekStart, weekEnd, rosters.design,       payrollByDept.design,       location);
  const preservation = computeActualDeptMetrics(rows, 'preservation', weekStart, weekEnd, rosters.preservation, payrollByDept.preservation, location);
  const fulfillment  = computeActualDeptMetrics(rows, 'fulfillment',  weekStart, weekEnd, rosters.fulfillment,  payrollByDept.fulfillment,  location);

  const gRatios = [design.goalRatio, preservation.goalRatio, fulfillment.goalRatio].filter(r => r !== null) as number[];
  const gCpos   = [design.goalCPO,   preservation.goalCPO,   fulfillment.goalCPO  ].filter(c => c !== null) as number[];

  // Combined CPO = sum of per-dept CPOs + G&A spread across all orders
  const totalOrders = design.orders + preservation.orders + fulfillment.orders;
  const totalHours  = design.hours  + preservation.hours  + fulfillment.hours;
  const deptCPOs    = [design.cpo, preservation.cpo, fulfillment.cpo].filter(c => c !== null) as number[];
  const gaCost      = Object.values(payrollByDept.ga).reduce((s, v) => s + v, 0);
  const gaCPO       = totalOrders > 0 && gaCost > 0 ? gaCost / totalOrders : 0;
  const combinedCPO = deptCPOs.length > 0 ? deptCPOs.reduce((a, b) => a + b, 0) + gaCPO : null;

  const allActual = [...design.actualPayroll, ...preservation.actualPayroll, ...fulfillment.actualPayroll].length > 0
    && [...design.estimatedPayroll, ...preservation.estimatedPayroll, ...fulfillment.estimatedPayroll].length === 0
    && [...design.missingRates, ...preservation.missingRates, ...fulfillment.missingRates].length === 0;
  const anyActual = [...design.actualPayroll, ...preservation.actualPayroll, ...fulfillment.actualPayroll].length > 0;

  return {
    design, preservation, fulfillment,
    combinedRatio:     totalOrders > 0 && totalHours > 0 ? totalHours / totalOrders : null,
    combinedCPO,
    combinedGoalRatio: gRatios.length > 0 ? gRatios.reduce((a, b) => a + b, 0) / gRatios.length : null,
    combinedGoalCPO:   gCpos.length   > 0 ? gCpos.reduce((a, b) => a + b, 0) : null,
    allActual,
    anyActual,
  };
}

function buildGoalPeriod(
  weekStart: string,
  weekEnd: string,
  rosters: { design: RosterMember[]; preservation: RosterMember[]; fulfillment: RosterMember[] }
): PeriodMetrics {
  const design       = computeScheduledDeptGoal('design',       weekStart, weekEnd, rosters.design);
  const preservation = computeScheduledDeptGoal('preservation', weekStart, weekEnd, rosters.preservation);
  const fulfillment  = computeScheduledDeptGoal('fulfillment',  weekStart, weekEnd, rosters.fulfillment);

  const gRatios = [design.goalRatio, preservation.goalRatio, fulfillment.goalRatio].filter(r => r !== null) as number[];
  const gCpos   = [design.goalCPO,   preservation.goalCPO,   fulfillment.goalCPO  ].filter(c => c !== null) as number[];

  return {
    design, preservation, fulfillment,
    combinedRatio: null, combinedCPO: null,
    combinedGoalRatio: gRatios.length > 0 ? gRatios.reduce((a, b) => a + b, 0) : null,
    combinedGoalCPO:   gCpos.length   > 0 ? gCpos.reduce((a, b) => a + b, 0)   : null,
    allActual: false,
    anyActual: false,
  };
}

interface LaborRow {
  employee:   string;
  department: string;
  week_of:    string;
  gross_pay:  number;
}

// Fetch actual gross pay from weekly_labor_cost table, summed per employee for the period
async function fetchPayrollForPeriod(
  location: string,
  department: string,
  from: string,
  to: string
): Promise<PayrollMap> {
  try {
    const res = await fetch(
      `/api/admin/weekly-labor-upload?location=${location}&from=${from}&to=${to}`
    );
    if (!res.ok) return {};
    const data = await res.json() as { rows?: LaborRow[] };
    const map: PayrollMap = {};
    // Filter to the requested dept and sum gross pay per employee
    (data.rows ?? [])
      .filter(r => r.department.toLowerCase() === department.toLowerCase())
      .forEach(r => {
        map[r.employee] = (map[r.employee] ?? 0) + r.gross_pay;
      });
    return map;
  } catch {
    return {};
  }
}

export function useHistoricalMetrics(
  location: 'Utah' | 'Georgia',
  rosters: { design: RosterMember[]; preservation: RosterMember[]; fulfillment: RosterMember[] }
): HistoricalMetrics {
  const [rows,    setRows]    = useState<ActualRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Payroll maps per dept per period
  const [payroll, setPayroll] = useState<{
    thisMonth:  { design: PayrollMap; preservation: PayrollMap; fulfillment: PayrollMap; ga: PayrollMap };
    lastMonth:  { design: PayrollMap; preservation: PayrollMap; fulfillment: PayrollMap; ga: PayrollMap };
    lastWeek:   { design: PayrollMap; preservation: PayrollMap; fulfillment: PayrollMap; ga: PayrollMap };
  }>({
    thisMonth:  { design: {}, preservation: {}, fulfillment: {}, ga: {} },
    lastMonth:  { design: {}, preservation: {}, fulfillment: {}, ga: {} },
    lastWeek:   { design: {}, preservation: {}, fulfillment: {}, ga: {} },
  });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/actuals?location=${location}&type=team&weeks=100`)
      .then(r => r.json())
      .then((d: { teamActuals?: ActualRow[] }) => setRows(d.teamActuals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  // Fetch Rippling payroll data for all periods and depts
  useEffect(() => {
    const thisMonth = getMonthBounds(0);
    const lastMonth = getMonthBounds(-1);
    const lastWeekStart = isoDate(getMondayDate(-1));
    const lastWeekEnd   = isoDate(new Date(new Date(lastWeekStart + 'T12:00:00').getTime() + 6 * 86400000));
    const depts = ['Design', 'Preservation', 'Fulfillment'] as const;
    const deptKeys = ['design', 'preservation', 'fulfillment'] as const;

    Promise.all([
      // thisMonth
      ...depts.map((d, i) => fetchPayrollForPeriod(location, d, thisMonth.start, thisMonth.end).then(m => ({ period: 'thisMonth', dept: deptKeys[i], map: m }))),
      fetchPayrollForPeriod(location, 'G&A', thisMonth.start, thisMonth.end).then(m => ({ period: 'thisMonth', dept: 'ga', map: m })),
      // lastMonth
      ...depts.map((d, i) => fetchPayrollForPeriod(location, d, lastMonth.start, lastMonth.end).then(m => ({ period: 'lastMonth', dept: deptKeys[i], map: m }))),
      fetchPayrollForPeriod(location, 'G&A', lastMonth.start, lastMonth.end).then(m => ({ period: 'lastMonth', dept: 'ga', map: m })),
      // lastWeek
      ...depts.map((d, i) => fetchPayrollForPeriod(location, d, lastWeekStart, lastWeekEnd).then(m => ({ period: 'lastWeek', dept: deptKeys[i], map: m }))),
      fetchPayrollForPeriod(location, 'G&A', lastWeekStart, lastWeekEnd).then(m => ({ period: 'lastWeek', dept: 'ga', map: m })),
    ]).then(results => {
      const next = {
        thisMonth:  { design: {} as PayrollMap, preservation: {} as PayrollMap, fulfillment: {} as PayrollMap, ga: {} as PayrollMap },
        lastMonth:  { design: {} as PayrollMap, preservation: {} as PayrollMap, fulfillment: {} as PayrollMap, ga: {} as PayrollMap },
        lastWeek:   { design: {} as PayrollMap, preservation: {} as PayrollMap, fulfillment: {} as PayrollMap, ga: {} as PayrollMap },
      };
      results.forEach(r => {
        (next[r.period as keyof typeof next] as Record<string, PayrollMap>)[r.dept] = r.map;
      });
      setPayroll(next);
    }).catch(() => {});
  }, [location]);

  const metrics = useMemo(() => {
    const thisMonth  = getMonthBounds(0);
    const lastMonth  = getMonthBounds(-1);
    const lastWeekStart = isoDate(getMondayDate(-1));
    const lastWeekEnd   = isoDate(new Date(new Date(lastWeekStart + 'T12:00:00').getTime() + 6 * 86400000));
    const nextMonth  = getMonthBounds(1);

    return {
      thisMonth:     buildPeriod(rows, thisMonth.start,  thisMonth.end,  rosters, payroll.thisMonth,  location),
      lastMonth:     buildPeriod(rows, lastMonth.start,  lastMonth.end,  rosters, payroll.lastMonth,  location),
      lastWeek:      buildPeriod(rows, lastWeekStart,    lastWeekEnd,    rosters, payroll.lastWeek,   location),
      thisMonthGoal: buildGoalPeriod(thisMonth.start, thisMonth.end, rosters),
      nextMonthGoal: buildGoalPeriod(nextMonth.start, nextMonth.end, rosters),
      loading,
    };
  }, [rows, loading, rosters, payroll]); // eslint-disable-line react-hooks/exhaustive-deps

  return metrics;
}
