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

export interface WeeklyLaborRow {
  employee:   string;
  location:   string;
  department: string;
  week_of:    string;
  gross_pay:  number;
}

export interface SalaryManager {
  name:          string;
  location:      string;
  departments:   string[];  // depts to split across equally
  annualSalary:  number;
}

export interface EnrichedActual extends ActualRow {
  cost:     number;
  isActual: boolean;
}

export interface WeekCost {
  week_of:    string;
  department: string; // 'Design' | 'Preservation' | 'Fulfillment' | 'G&A'
  totalCost:  number;
  isActual:   boolean;
}

// Salary managers — sourced from rippling_employees table
// These are loaded dynamically but we keep defaults here as fallback
const SALARY_MANAGERS: SalaryManager[] = [
  { name: 'Amber Garrett',   location: 'Georgia', departments: ['Design', 'Preservation'], annualSalary: 56000 },
  { name: 'Jennika Merrill', location: 'Utah',    departments: ['Design'],                 annualSalary: 45760 },
  { name: 'Bella DePrima',   location: 'Utah',    departments: ['Fulfillment'],            annualSalary: 41600 },
];

export function useActualsWithPayroll(location: 'Utah' | 'Georgia') {
  const [actuals,     setActuals]     = useState<ActualRow[]>([]);
  const [laborRows,   setLaborRows]   = useState<WeeklyLaborRow[]>([]);
  const [salaryMgrs,  setSalaryMgrs]  = useState<SalaryManager[]>(SALARY_MANAGERS.filter(m => m.location === location));
  const [loading,     setLoading]     = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [actualsRes, laborRes, empRes] = await Promise.all([
        fetch(`/api/actuals?location=${location}&type=team&weeks=100`),
        fetch(`/api/admin/weekly-labor-upload?location=${location}&from=2025-12-01&to=${new Date().toISOString().split('T')[0]}`),
        fetch(`/api/admin/employees-upload?location=${location}`),
      ]);

      const actualsData = await actualsRes.json() as { teamActuals?: ActualRow[] };
      setActuals(actualsData.teamActuals ?? []);

      const laborData = await laborRes.json() as { rows?: WeeklyLaborRow[] };
      setLaborRows(laborData.rows ?? []);

      // Load salary managers from employee directory
      const empData = await empRes.json() as { employees?: { full_name: string; location: string; department: string; pay_type: string; annual_salary: number }[] };
      const salaryEmps = (empData.employees ?? []).filter(e => e.pay_type === 'salary' && e.annual_salary > 0);

      // Group by person to handle multi-dept managers (Amber)
      const mgrMap: Record<string, SalaryManager> = {};
      for (const e of salaryEmps) {
        if (!mgrMap[e.full_name]) {
          mgrMap[e.full_name] = { name: e.full_name, location: e.location, departments: [], annualSalary: e.annual_salary };
        }
        if (!mgrMap[e.full_name].departments.includes(e.department)) {
          mgrMap[e.full_name].departments.push(e.department);
        }
      }
      if (Object.keys(mgrMap).length > 0) {
        setSalaryMgrs(Object.values(mgrMap).filter(m => m.location === location));
      }
    } catch {}
    setLoading(false);
  }, [location]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Get weekly cost per dept including G&A and salary managers
  function getWeekCosts(weekOf: string): WeekCost[] {
    const costs: WeekCost[] = [];
    const depts = ['Design', 'Preservation', 'Fulfillment', 'G&A'];

    // From weekly labor upload
    const weekRows = laborRows.filter(r => r.week_of === weekOf);
    for (const dept of depts) {
      const deptRows = weekRows.filter(r => r.department === dept || 
        (dept === 'G&A' && (r.department === 'G&A' || r.department.toLowerCase().includes('general') || r.department.toLowerCase().includes('admin') || r.department.toLowerCase().includes('operations'))));
      const total = deptRows.reduce((s, r) => s + r.gross_pay, 0);
      if (total > 0) costs.push({ week_of: weekOf, department: dept, totalCost: total, isActual: true });
    }

    // Add salary manager weekly cost
    for (const mgr of salaryMgrs) {
      const weeklyPay = mgr.annualSalary / 52;
      const perDept   = weeklyPay / mgr.departments.length;
      for (const dept of mgr.departments) {
        const existing = costs.find(c => c.week_of === weekOf && c.department === dept);
        if (existing) {
          existing.totalCost += perDept;
        } else {
          costs.push({ week_of: weekOf, department: dept, totalCost: perDept, isActual: weekRows.length > 0 });
        }
      }
    }

    return costs;
  }

  // Compute CPO for a week across all depts
  function getWeekCPO(weekOf: string, ordersByDept: Record<string, number>): { cpo: number | null; isActual: boolean } | null {
    const weekCosts = getWeekCosts(weekOf);
    if (weekCosts.length === 0) return null;

    const totalOrders = Object.values(ordersByDept).reduce((s, n) => s + n, 0);
    if (totalOrders === 0) return null;

    let totalCPO = 0;
    let anyActual = false;

    // Per-dept CPO
    for (const dept of ['Design', 'Preservation', 'Fulfillment']) {
      const cost = weekCosts.find(c => c.department === dept)?.totalCost ?? 0;
      const orders = ordersByDept[dept.toLowerCase()] ?? 0;
      if (cost > 0 && orders > 0) {
        totalCPO += cost / orders;
        if (weekCosts.find(c => c.department === dept)?.isActual) anyActual = true;
      }
    }

    // G&A spread across all orders
    const gaCost = weekCosts.find(c => c.department === 'G&A')?.totalCost ?? 0;
    if (gaCost > 0 && totalOrders > 0) {
      totalCPO += gaCost / totalOrders;
    }

    return { cpo: totalCPO, isActual: anyActual };
  }

  // Enrich actuals with cost data
  function enrich(rows: ActualRow[]): EnrichedActual[] {
    return rows.map(row => {
      // Find weekly labor for this person+dept
      const laborRow = laborRows.find(r =>
        r.employee === row.member_name &&
        r.department.toLowerCase() === row.department.toLowerCase() &&
        r.week_of === row.week_of
      );

      if (laborRow && laborRow.gross_pay > 0) {
        return { ...row, cost: laborRow.gross_pay, isActual: true };
      }

      // Fall back — cost will be 0, caller uses rate estimate
      return { ...row, cost: 0, isActual: false };
    });
  }

  return {
    actuals,
    laborRows,
    salaryMgrs,
    enrichedActuals: enrich(actuals),
    getWeekCosts,
    getWeekCPO,
    loading,
    refresh: fetchAll,
  };
}
