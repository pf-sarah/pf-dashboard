// Single source of truth for department managers and general managers used in
// CPO calculations across /api/kpis, /api/scorecard, useActualsWithPayroll,
// and useHistoricalMetrics. Update this file (only) when a manager's pay or
// role changes — every consumer picks it up automatically.
//
// Two tiers:
//  - DEPARTMENT_MANAGERS: fixed-salary staff whose pay never appears in the
//    weekly_labor_cost / actuals upload. Included in their department's CPO.
//    Hourly managers need NO entry here — their pay already flows through the
//    normal actuals/payroll path like any other hourly employee.
//  - GENERAL_MANAGERS: location-wide GMs. Always excluded from per-department
//    CPO; only ever folded into the combined "cpoWithGM" metric.
//
// To record a manager change: close the outgoing entry with a `to` date
// (the last day it applied) and add a new entry with a `from` date (the
// first day the new arrangement applies). Never mutate an entry's history —
// append a new one so past weeks still compute correctly.

export interface SalaryMgr {
  name:         string;
  location:     string;
  departments:  string[];  // cost is split evenly across these
  annualSalary: number;
  from?:        string;    // inclusive, 'YYYY-MM-DD' (Monday week_of)
  to?:          string;    // inclusive, 'YYYY-MM-DD' (Monday week_of)
}

export const DEPARTMENT_MANAGERS: SalaryMgr[] = [
  // Utah
  { name: 'Jennika Merrill', location: 'Utah',    departments: ['Design'],                annualSalary: 45760 },
  { name: 'Bella DePrima',   location: 'Utah',    departments: ['Fulfillment'],           annualSalary: 41600 },
  // Georgia — time-aware
  { name: 'Amber Garrett',   location: 'Georgia', departments: ['Preservation'],          annualSalary: 47008,  to:   '2026-04-12' },
  { name: 'Amber Garrett',   location: 'Georgia', departments: ['Design','Preservation'], annualSalary: 56000,  from: '2026-04-13', to: '2026-06-19' },
  // From 2026-06-20: Katherine Piper (Design) and Celt Stewart (Preservation)
  // are the Georgia dept managers. Both are hourly — their pay flows through
  // weekly_labor_cost / actuals like any other team member, so no entry is
  // needed here.
];

export const GENERAL_MANAGERS: SalaryMgr[] = [
  { name: 'Lauren Boyd',      location: 'Utah',    departments: ['Design','Preservation','Fulfillment'], annualSalary: 60000.20 },
  { name: 'Zachary Williams', location: 'Georgia', departments: ['Design','Preservation','Fulfillment'], annualSalary: 52000 },
];

export const GM_NAMES: string[] = GENERAL_MANAGERS.map(gm => gm.name);

function deptMatches(mgrDepts: string[], dept: string): boolean {
  return mgrDepts.some(d => d.toLowerCase() === dept.toLowerCase());
}

// Department-manager cost for one location+department across a set of weeks.
export function getSalaryMgrCostForWeeks(
  managers: SalaryMgr[],
  location: string,
  dept:     string,
  weekOfs:  string[]
): number {
  let total = 0;
  for (const weekOf of weekOfs) {
    for (const mgr of managers) {
      if (mgr.location !== location) continue;
      if (!deptMatches(mgr.departments, dept)) continue;
      const after  = !mgr.from || weekOf >= mgr.from;
      const before = !mgr.to   || weekOf <= mgr.to;
      if (after && before) {
        total += (mgr.annualSalary / 52) / mgr.departments.length;
      }
    }
  }
  return total;
}

// Total GM cost for a location across a set of weeks. GMs are location-wide
// (not per-department), so this must be computed once per location — never
// summed once per department and divided back down.
export function getGmCostForWeeks(location: string, weekOfs: string[]): number {
  return GENERAL_MANAGERS
    .filter(gm => gm.location === location)
    .reduce((sum, gm) => sum + (gm.annualSalary / 52) * weekOfs.length, 0);
}
