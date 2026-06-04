import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LaborRow {
  employee:   string;
  location:   string;
  department: string;
  week_of:    string;
  gross_pay:  number;
}

interface ActualRow {
  week_of:       string;
  member_name:   string;
  department:    string;
  location:      string;
  actual_hours:  number;
  actual_orders: number;
}

interface ScheduleSettingRow {
  location: string;
  key:      string;
  value:    unknown;
}

export interface KpiMetrics {
  hours:        number;
  production:   number;
  laborCost:    number;
  ratio:        number | null;   // hours / production
  cpo:          number | null;   // laborCost / production
  cpoWithGM:    number | null;   // (laborCost + GM salary) / production — combined only
  hasData:      boolean;
}

export interface PeriodKpis {
  design:            KpiMetrics;
  preservation:      KpiMetrics;
  fulfillment:       KpiMetrics;
  resin:             KpiMetrics;
  ga:                KpiMetrics;   // cost only — no production, no ratio
  combined:          KpiMetrics;   // Design + Preservation + Fulfillment (+ G&A cost spread)
}

export interface WindowResult {
  label:       string;
  periodStart: string;
  periodEnd:   string;
  utah:        PeriodKpis;
  georgia:     PeriodKpis;
  combined:    PeriodKpis;   // Utah + Georgia pooled
}

export interface EstimatedMonthResult {
  label:      string;
  monthStart: string;
  isSnapshot: boolean;
  utah:       PeriodKpis;
  georgia:    PeriodKpis;
  combined:   PeriodKpis;
}

// ── Salary managers ───────────────────────────────────────────────────────────
// These are never in weekly_labor_cost. Cost computed from annual salary ÷ 52.
// Mirrors scorecard/route.ts exactly.

interface SalaryMgr {
  name:         string;
  location:     string;
  departments:  string[];
  annualSalary: number;
  from?:        string;
  to?:          string;
}

const SALARY_MANAGERS: SalaryMgr[] = [
  // Utah
  { name: 'Jennika Merrill', location: 'Utah',    departments: ['Design'],                annualSalary: 45760 },
  { name: 'Bella DePrima',   location: 'Utah',    departments: ['Fulfillment'],           annualSalary: 41600 },
  // Georgia — time-aware
  { name: 'Katherine Piper', location: 'Georgia', departments: ['Design'],                annualSalary: 45760,  to:   '2026-04-12' },
  { name: 'Amber Garrett',   location: 'Georgia', departments: ['Preservation'],          annualSalary: 47008,  to:   '2026-04-12' },
  { name: 'Amber Garrett',   location: 'Georgia', departments: ['Design','Preservation'], annualSalary: 56000,  from: '2026-04-13' },
];

// GMs — excluded from dept CPO, included only in cpoWithGM on combined
const GM_MANAGERS: SalaryMgr[] = [
  { name: 'Lauren Boyd',      location: 'Utah',    departments: ['Design','Preservation','Fulfillment'], annualSalary: 60000.20 },
  { name: 'Zachary Williams', location: 'Georgia', departments: ['Design','Preservation','Fulfillment'], annualSalary: 52000 },
];

function getSalaryMgrCostForWeeks(
  managers:  SalaryMgr[],
  location:  string,
  dept:      string,
  weekOfs:   string[]
): number {
  let total = 0;
  for (const weekOf of weekOfs) {
    for (const mgr of managers) {
      if (mgr.location !== location) continue;
      if (!mgr.departments.includes(dept)) continue;
      const after  = !mgr.from || weekOf >= mgr.from;
      const before = !mgr.to   || weekOf <= mgr.to;
      if (after && before) {
        total += (mgr.annualSalary / 52) / mgr.departments.length;
      }
    }
  }
  return total;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMondayOf(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function getSundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return isoDate(d);
}

function getWeekMondays(start: string, end: string): string[] {
  const mondays: string[] = [];
  const startMonday = getMondayOf(start);
  const cur = new Date(startMonday + 'T12:00:00');
  while (isoDate(cur) <= end) {
    mondays.push(isoDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return mondays;
}

function getQuarterStart(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}

function getQuarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function weekLabel(monday: string): string {
  const d = new Date(monday + 'T12:00:00');
  return `W/C ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ── Dept normalization ────────────────────────────────────────────────────────

function normDept(raw: string): string {
  const l = raw.toLowerCase();
  if (l.includes('design'))                                         return 'Design';
  if (l.includes('preservation'))                                   return 'Preservation';
  if (l.includes('fulfillment'))                                    return 'Fulfillment';
  if (l.includes('general') || l.includes('admin') || l === 'g&a') return 'G&A';
  if (l.includes('resin'))                                          return 'Resin';
  return raw;
}

// ── Core computation ──────────────────────────────────────────────────────────

function computePeriodKpis(
  laborRows:  LaborRow[],
  actualRows: ActualRow[],
  location:   string,
  weekOfs:    string[]
): PeriodKpis {
  const PROD_DEPTS = ['Design', 'Preservation', 'Fulfillment'] as const;
  const ALL_DEPTS  = [...PROD_DEPTS, 'G&A', 'Resin'] as const;

  // Sum labor cost from weekly_labor_cost
  const laborByDept: Record<string, number> = {};
  for (const row of laborRows.filter(r => r.location === location && weekOfs.includes(r.week_of))) {
    const dept = normDept(row.department);
    laborByDept[dept] = (laborByDept[dept] ?? 0) + row.gross_pay;
  }

  // Inject salary manager costs (never in weekly_labor_cost)
  for (const dept of ALL_DEPTS) {
    const mgrCost = getSalaryMgrCostForWeeks(SALARY_MANAGERS, location, dept, weekOfs);
    if (mgrCost > 0) laborByDept[dept] = (laborByDept[dept] ?? 0) + mgrCost;
  }

  // Sum hours + production from team_member_week_actuals
  const hoursByDept: Record<string, number> = {};
  const prodByDept:  Record<string, number> = {};
  for (const row of actualRows.filter(r => r.location === location && weekOfs.includes(r.week_of))) {
    const dept = normDept(row.department);
    hoursByDept[dept] = (hoursByDept[dept] ?? 0) + row.actual_hours;
    prodByDept[dept]  = (prodByDept[dept]  ?? 0) + row.actual_orders;
  }

  function makeMetrics(dept: string, overrideProduction?: number): KpiMetrics {
    const hours      = hoursByDept[dept] ?? 0;
    const production = overrideProduction ?? (prodByDept[dept] ?? 0);
    const laborCost  = laborByDept[dept] ?? 0;
    return {
      hours,
      production,
      laborCost,
      ratio:     (hours > 0 && production > 0) ? hours / production : null,
      cpo:       (laborCost > 0 && production > 0) ? laborCost / production : null,
      cpoWithGM: null,
      hasData:   hours > 0 || production > 0 || laborCost > 0,
    };
  }

  const design       = makeMetrics('Design');
  const preservation = makeMetrics('Preservation');
  const fulfillment  = makeMetrics('Fulfillment');
  const resin        = makeMetrics('Resin');

  // Combined = Design + Preservation + Fulfillment (Resin excluded from blended CPO)
  const totalProdOrders = design.production + preservation.production + fulfillment.production;

  // G&A CPO = G&A labor cost / total production orders (no production of its own)
  const ga           = makeMetrics('G&A', totalProdOrders);
  const totalHours      = design.hours      + preservation.hours      + fulfillment.hours;
  const gaCost          = ga.laborCost;

  // Blended CPO: sum of per-dept CPOs + G&A spread across total production orders
  let blendedCPO: number | null = null;
  let blendedSum = 0;
  let blendedHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.cpo !== null) { blendedSum += m.cpo; blendedHasData = true; }
  }
  if (gaCost > 0 && totalProdOrders > 0) {
    blendedSum += gaCost / totalProdOrders;
    blendedHasData = true;
  }
  if (blendedHasData) blendedCPO = blendedSum;

  // GM cost for this location + period — spread across total production orders
  const totalGMCost = PROD_DEPTS.reduce(
    (sum, dept) => sum + getSalaryMgrCostForWeeks(GM_MANAGERS, location, dept, weekOfs), 0
  );
  // De-dup: GM_MANAGERS has each GM in 3 depts, so the loop above triple-counts.
  // Divide by 3 to get true per-location GM cost.
  const gmCostPerLocation = totalGMCost / 3;

  const blendedCPOWithGM =
    blendedCPO !== null && totalProdOrders > 0
      ? blendedCPO + gmCostPerLocation / totalProdOrders
      : blendedCPO !== null
        ? blendedCPO
        : null;

  // Combined ratio: sum of per-dept ratios (additive, mirrors scorecard)
  let combinedRatio: number | null = null;
  let ratioSum = 0; let ratioHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.ratio !== null) { ratioSum += m.ratio; ratioHasData = true; }
  }
  if (ratioHasData) combinedRatio = ratioSum;

  const combinedLaborCost = design.laborCost + preservation.laborCost + fulfillment.laborCost + gaCost;

  const combined: KpiMetrics = {
    hours:      totalHours,
    production: totalProdOrders,
    laborCost:  combinedLaborCost,
    ratio:      combinedRatio,
    cpo:        blendedCPO,
    cpoWithGM:  blendedCPOWithGM,
    hasData:    totalHours > 0 || totalProdOrders > 0 || combinedLaborCost > 0,
  };

  return { design, preservation, fulfillment, resin, ga, combined };
}

function poolLocations(utah: PeriodKpis, georgia: PeriodKpis): PeriodKpis {
  function poolMetrics(a: KpiMetrics, b: KpiMetrics): KpiMetrics {
    const hours      = a.hours      + b.hours;
    const production = a.production + b.production;
    const laborCost  = a.laborCost  + b.laborCost;
    return {
      hours, production, laborCost,
      ratio:     (hours > 0 && production > 0) ? hours / production : null,
      cpo:       (laborCost > 0 && production > 0) ? laborCost / production : null,
      cpoWithGM: null,
      hasData:   hours > 0 || production > 0 || laborCost > 0,
    };
  }

  const design       = poolMetrics(utah.design,       georgia.design);
  const preservation = poolMetrics(utah.preservation, georgia.preservation);
  const fulfillment  = poolMetrics(utah.fulfillment,  georgia.fulfillment);
  const resin        = poolMetrics(utah.resin,        georgia.resin);
  const ga           = poolMetrics(utah.ga,           georgia.ga);

  const totalProdOrders = design.production + preservation.production + fulfillment.production;

  // Re-derive blended CPO additively from pooled dept metrics (don't sum two blendedCPOs)
  let blendedCPO: number | null = null;
  let blendedSum = 0; let blendedHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.cpo !== null) { blendedSum += m.cpo; blendedHasData = true; }
  }
  if (ga.laborCost > 0 && totalProdOrders > 0) {
    blendedSum += ga.laborCost / totalProdOrders; blendedHasData = true;
  }
  if (blendedHasData) blendedCPO = blendedSum;

  // Combined GM cost = Utah GM + Georgia GM
  const utahGMCost    = utah.combined.cpoWithGM !== null && utah.combined.cpo !== null && utah.combined.production > 0
    ? (utah.combined.cpoWithGM    - utah.combined.cpo)    * utah.combined.production    : 0;
  const georgiaGMCost = georgia.combined.cpoWithGM !== null && georgia.combined.cpo !== null && georgia.combined.production > 0
    ? (georgia.combined.cpoWithGM - georgia.combined.cpo) * georgia.combined.production : 0;
  const totalGMCost   = utahGMCost + georgiaGMCost;

  const blendedCPOWithGM =
    blendedCPO !== null && totalProdOrders > 0
      ? blendedCPO + totalGMCost / totalProdOrders
      : blendedCPO;

  let combinedRatio: number | null = null;
  let ratioSum = 0; let ratioHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.ratio !== null) { ratioSum += m.ratio; ratioHasData = true; }
  }
  if (ratioHasData) combinedRatio = ratioSum;

  const combinedLaborCost = design.laborCost + preservation.laborCost + fulfillment.laborCost + ga.laborCost;
  const totalHours        = design.hours + preservation.hours + fulfillment.hours;

  const combined: KpiMetrics = {
    hours: totalHours, production: totalProdOrders, laborCost: combinedLaborCost,
    ratio: combinedRatio, cpo: blendedCPO, cpoWithGM: blendedCPOWithGM,
    hasData: totalHours > 0 || totalProdOrders > 0,
  };

  return { design, preservation, fulfillment, resin, ga, combined };
}

function buildWindowResult(
  label:      string,
  start:      string,
  end:        string,
  laborRows:  LaborRow[],
  actualRows: ActualRow[]
): WindowResult {
  const weekOfs = getWeekMondays(start, end);
  const utah    = computePeriodKpis(laborRows, actualRows, 'Utah',    weekOfs);
  const georgia = computePeriodKpis(laborRows, actualRows, 'Georgia', weekOfs);
  return { label, periodStart: start, periodEnd: end, utah, georgia, combined: poolLocations(utah, georgia) };
}

// ── Estimated projections from schedule_settings ──────────────────────────────
// Roster shapes (from useScheduleSettings.ts):
//   designRoster: { [id]: { ratio, payType, hourlyRate, annualSalary, name, isManager? } }
//   presRoster:   { [id]: { ratio, rate, name, payType?, annualSalary?, isManager? } }
//   ffRoster:     { [id]: { ratio, rate, name, payType?, annualSalary? } }
//   designHours / presHours / ffHours: { [memberId]: number[] }  (52 weekly hours)

interface DesignRosterEntry  { ratio: number; payType?: string; hourlyRate?: number; annualSalary?: number; name: string; isManager?: boolean }
interface PresRosterEntry    { ratio: number; rate?: number;    payType?: string;    annualSalary?: number; name: string; isManager?: boolean }
interface HoursMap           { [memberId: string]: number[] }

function projectDept(
  roster:   Record<string, DesignRosterEntry | PresRosterEntry>,
  hours:    HoursMap,
  weekOfs:  string[],         // Mondays in the month
  weekIdxOffset: number,      // which index into the 52-week array the first weekOf maps to
  location: string,
  dept:     string,           // 'Design' | 'Preservation' | 'Fulfillment'
  settings: ScheduleSettingRow[]
): { hours: number; production: number; laborCost: number } {
  let totalHours = 0, totalProduction = 0, totalCost = 0;

  for (const [memberId, member] of Object.entries(roster)) {
    if ((member as { _removed?: boolean })._removed) continue;

    const memberHours = weekOfs.reduce((sum, _w, i) => {
      const hoursArr = hours[memberId];
      return sum + (Array.isArray(hoursArr) ? (hoursArr[weekIdxOffset + i] ?? 0) : 0);
    }, 0);

    totalHours += memberHours;
    if (member.ratio > 0) totalProduction += memberHours / member.ratio;

    const payType     = member.payType ?? 'hourly';
    const hourlyRate  = (member as DesignRosterEntry).hourlyRate ?? (member as PresRosterEntry).rate ?? 0;
    const annualSal   = member.annualSalary ?? 0;

    if (payType === 'salary' && annualSal > 0) {
      totalCost += (annualSal / 52) * weekOfs.length;
    } else if (hourlyRate > 0) {
      totalCost += memberHours * hourlyRate;
    }
  }

  // Add salary manager cost for this dept
  totalCost += getSalaryMgrCostForWeeks(SALARY_MANAGERS, location, dept, weekOfs);

  return { hours: totalHours, production: totalProduction, laborCost: totalCost };

  void settings; // unused but kept for future G&A projection
}

// Maps a calendar month's Mondays to their index in the 52-week schedule array.
// Week index 0 = week of 2025-12-29 (mirrors getWeekIndex in useHistoricalMetrics.ts)
function getWeekIdxOffset(firstMonday: string): number {
  const SCHEDULE_EPOCH = new Date('2025-12-29T12:00:00');
  const d = new Date(firstMonday + 'T12:00:00');
  return Math.round((d.getTime() - SCHEDULE_EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function projectMonthForLocation(
  settings:   ScheduleSettingRow[],
  location:   string,
  monthStart: string
): PeriodKpis {
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);
  const weekOfs      = getWeekMondays(monthStart, isoDate(monthEnd));
  const weekIdxOff   = getWeekIdxOffset(weekOfs[0] ?? monthStart);

  const get = (key: string) => settings.find(r => r.location === location && r.key === key)?.value ?? {};

  const designRoster = get('designRoster') as Record<string, DesignRosterEntry>;
  const presRoster   = get('presRoster')   as Record<string, PresRosterEntry>;
  const ffRoster     = get('ffRoster')     as Record<string, PresRosterEntry>;
  const designHours  = get('designHours')  as HoursMap;
  const presHours    = get('presHours')    as HoursMap;
  const ffHours      = get('ffHours')      as HoursMap;

  const designMetrics = projectDept(designRoster, designHours, weekOfs, weekIdxOff, location, 'Design',       settings);
  const presMetrics   = projectDept(presRoster,   presHours,   weekOfs, weekIdxOff, location, 'Preservation', settings);
  const ffMetrics     = projectDept(ffRoster,     ffHours,     weekOfs, weekIdxOff, location, 'Fulfillment',  settings);

  function toMetrics(m: { hours: number; production: number; laborCost: number }): KpiMetrics {
    return {
      hours:      m.hours,
      production: m.production,
      laborCost:  m.laborCost,
      ratio:      m.hours > 0 && m.production > 0 ? m.hours / m.production : null,
      cpo:        m.laborCost > 0 && m.production > 0 ? m.laborCost / m.production : null,
      cpoWithGM:  null,
      hasData:    m.hours > 0 || m.production > 0 || m.laborCost > 0,
    };
  }

  const design       = toMetrics(designMetrics);
  const preservation = toMetrics(presMetrics);
  const fulfillment  = toMetrics(ffMetrics);
  const resin: KpiMetrics = { hours: 0, production: 0, laborCost: 0, ratio: null, cpo: null, cpoWithGM: null, hasData: false };
  const ga:    KpiMetrics = { hours: 0, production: 0, laborCost: 0, ratio: null, cpo: null, cpoWithGM: null, hasData: false };

  const totalProdOrders   = design.production + preservation.production + fulfillment.production;
  const totalHours        = design.hours       + preservation.hours       + fulfillment.hours;
  const combinedLaborCost = design.laborCost   + preservation.laborCost   + fulfillment.laborCost;

  let blendedCPO: number | null = null;
  let blendedSum = 0; let blendedHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.cpo !== null) { blendedSum += m.cpo; blendedHasData = true; }
  }
  if (blendedHasData) blendedCPO = blendedSum;

  // GM cost for projected month
  const gmCostTotal = GM_MANAGERS
    .filter(gm => gm.location === location)
    .reduce((sum, gm) => sum + (gm.annualSalary / 52) * weekOfs.length, 0);

  const blendedCPOWithGM =
    blendedCPO !== null && totalProdOrders > 0
      ? blendedCPO + gmCostTotal / totalProdOrders
      : blendedCPO;

  let combinedRatio: number | null = null;
  let ratioSum = 0; let ratioHasData = false;
  for (const m of [design, preservation, fulfillment]) {
    if (m.ratio !== null) { ratioSum += m.ratio; ratioHasData = true; }
  }
  if (ratioHasData) combinedRatio = ratioSum;

  const combined: KpiMetrics = {
    hours: totalHours, production: totalProdOrders, laborCost: combinedLaborCost,
    ratio: combinedRatio, cpo: blendedCPO, cpoWithGM: blendedCPOWithGM,
    hasData: totalHours > 0 || totalProdOrders > 0,
  };

  return { design, preservation, fulfillment, resin, ga, combined };
}

// ── GET /api/kpis ─────────────────────────────────────────────────────────────
//
// Query params:
//   windows = comma-separated list of:
//     mtd, qtd, ytd
//     weekly-N     (last N completed weeks,    default 12)
//     monthly-N    (last N completed months,   default 12)
//     quarterly-N  (last N completed quarters, default 4)
//     est-current  (estimated current month)
//     est-next     (estimated next month)
//
// Returns: { windows: WindowResult[], estimated: { current?, next? } }

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const windowsParam = req.nextUrl.searchParams.get('windows')
    ?? 'mtd,qtd,ytd,weekly-12,monthly-12,quarterly-4,est-current,est-next';
  const requested = windowsParam.split(',').map(s => s.trim());

  const now   = new Date();
  const today = isoDate(now);

  // Determine how far back we need data
  const monthsBack   = Math.max(...requested.filter(w => w.startsWith('monthly-')).map(w => parseInt(w.split('-')[1]) || 12),   12);
  const quartersBack = Math.max(...requested.filter(w => w.startsWith('quarterly-')).map(w => parseInt(w.split('-')[1]) || 4), 4);
  const weeksBack    = Math.max(...requested.filter(w => w.startsWith('weekly-')).map(w => parseInt(w.split('-')[1]) || 12),    12);

  const earliestDate = [
    `${now.getFullYear()}-01-01`,
    isoDate(getQuarterStart(now)),
    isoDate(new Date(now.getFullYear(), now.getMonth() - monthsBack,       1)),
    isoDate(new Date(now.getFullYear(), now.getMonth() - quartersBack * 3, 1)),
    isoDate(new Date(now.getTime() - weeksBack * 7 * 24 * 60 * 60 * 1000)),
  ].sort()[0];

  try {
    // Single pair of queries — all computation happens in memory
    const [laborRes, actualsRes] = await Promise.all([
      supabase
        .from('weekly_labor_cost')
        .select('employee,location,department,week_of,gross_pay')
        .gte('week_of', earliestDate),
      supabase
        .from('team_member_week_actuals')
        .select('week_of,member_name,department,location,actual_hours,actual_orders')
        .gte('week_of', earliestDate),
    ]);

    if (laborRes.error)   throw laborRes.error;
    if (actualsRes.error) throw actualsRes.error;

    const laborRows:  LaborRow[]  = laborRes.data  ?? [];
    const actualRows: ActualRow[] = actualsRes.data ?? [];

    const results: WindowResult[] = [];

    // ── MTD ───────────────────────────────────────────────────────────────────
    if (requested.includes('mtd')) {
      const mtdStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      results.push(buildWindowResult(`${monthLabel(mtdStart.slice(0, 7))} MTD`, mtdStart, today, laborRows, actualRows));
    }

    // ── QTD ───────────────────────────────────────────────────────────────────
    if (requested.includes('qtd')) {
      const qtdStart = isoDate(getQuarterStart(now));
      results.push(buildWindowResult(`${getQuarterLabel(now)} QTD`, qtdStart, today, laborRows, actualRows));
    }

    // ── YTD ───────────────────────────────────────────────────────────────────
    if (requested.includes('ytd')) {
      results.push(buildWindowResult(`${now.getFullYear()} YTD`, `${now.getFullYear()}-01-01`, today, laborRows, actualRows));
    }

    // ── Weekly series ─────────────────────────────────────────────────────────
    const weeklySeries = requested.find(w => w.startsWith('weekly-'));
    if (weeklySeries) {
      const n = parseInt(weeklySeries.split('-')[1]) || 12;
      const thisMonday = getMondayOf(today);
      for (let i = n; i >= 1; i--) {
        const d = new Date(thisMonday + 'T12:00:00');
        d.setDate(d.getDate() - i * 7);
        const monday = isoDate(d);
        const sunday = getSundayOf(monday);
        results.push(buildWindowResult(weekLabel(monday), monday, sunday, laborRows, actualRows));
      }
    }

    // ── Monthly series ────────────────────────────────────────────────────────
    const monthlySeries = requested.find(w => w.startsWith('monthly-'));
    if (monthlySeries) {
      const n = parseInt(monthlySeries.split('-')[1]) || 12;
      for (let i = n; i >= 1; i--) {
        const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const last  = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const key   = isoDate(first).slice(0, 7);
        results.push(buildWindowResult(monthLabel(key), isoDate(first), isoDate(last), laborRows, actualRows));
      }
    }

    // ── Quarterly series ──────────────────────────────────────────────────────
    const quarterlySeries = requested.find(w => w.startsWith('quarterly-'));
    if (quarterlySeries) {
      const n = parseInt(quarterlySeries.split('-')[1]) || 4;
      for (let i = n; i >= 1; i--) {
        const qDate  = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
        const qStart = getQuarterStart(qDate);
        const qEnd   = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
        results.push(buildWindowResult(getQuarterLabel(qStart), isoDate(qStart), isoDate(qEnd), laborRows, actualRows));
      }
    }

    // ── Estimated projections ─────────────────────────────────────────────────
    let estimated: { current?: EstimatedMonthResult; next?: EstimatedMonthResult } | null = null;

    if (requested.includes('est-current') || requested.includes('est-next')) {
      const { data: settingsData, error: settingsError } = await supabase
        .from('schedule_settings')
        .select('location,key,value');
      if (settingsError) throw settingsError;
      const liveSettings: ScheduleSettingRow[] = settingsData ?? [];

      estimated = {};

      if (requested.includes('est-current')) {
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // Try month-end snapshot first (locked, immutable)
        const { data: snapData } = await supabase
          .from('monthly_schedule_snapshots')
          .select('location,settings_json')
          .eq('snapshot_month', currentMonthKey);

        const snapSettings: ScheduleSettingRow[] = (snapData ?? []).flatMap(snap =>
          Object.entries(snap.settings_json as Record<string, unknown>).map(([key, value]) => ({
            location: snap.location as string,
            key,
            value,
          }))
        );

        const useSettings     = snapSettings.length > 0 ? snapSettings : liveSettings;
        const isSnapshot      = snapSettings.length > 0;
        const utahEst         = projectMonthForLocation(useSettings, 'Utah',    currentMonthKey);
        const georgiaEst      = projectMonthForLocation(useSettings, 'Georgia', currentMonthKey);

        estimated.current = {
          label:      `Est. ${monthLabel(currentMonthKey.slice(0, 7))}`,
          monthStart: currentMonthKey,
          isSnapshot,
          utah:       utahEst,
          georgia:    georgiaEst,
          combined:   poolLocations(utahEst, georgiaEst),
        };
      }

      if (requested.includes('est-next')) {
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthKey  = isoDate(nextMonthDate);
        const utahEst       = projectMonthForLocation(liveSettings, 'Utah',    nextMonthKey);
        const georgiaEst    = projectMonthForLocation(liveSettings, 'Georgia', nextMonthKey);

        estimated.next = {
          label:      `Est. ${monthLabel(nextMonthKey.slice(0, 7))}`,
          monthStart: nextMonthKey,
          isSnapshot: false,
          utah:       utahEst,
          georgia:    georgiaEst,
          combined:   poolLocations(utahEst, georgiaEst),
        };
      }
    }

    return NextResponse.json({
      ok:        true,
      windows:   results,
      estimated,
      meta: { generatedAt: new Date().toISOString(), windowCount: results.length },
    });

  } catch (e) {
    console.error('KPI route error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
