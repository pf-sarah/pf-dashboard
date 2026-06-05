#!/usr/bin/env python3
"""
patch-checks-unboxing.py
Run from your pf-dashboard root:
  python3 patch-checks-unboxing.py

Changes:
  1. useScheduleSettings.ts  — add presCheckHours to ScheduleSettings type + DEFAULTS + KEYS
  2. SchedulePage.tsx         — add presCheckHours state, pass to PreservationSection,
                                add check hours column to This Week table
  3. hours-upload/route.ts    — add 'checks & unboxing' → 'checks_unboxing' dept
  4. useActualsWithPayroll.ts — include Checks & Unboxing cost in Preservation CPO
  5. HistoricalsSection.tsx   — show Checks & Unboxing rows per person in teal,
                                combine with preservation for ratio/CPO
"""

import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

def r(path):
    with open(os.path.join(BASE, path)) as f: return f.read()

def w(path, content):
    with open(os.path.join(BASE, path), 'w') as f: f.write(content)

def patch(path, old, new, label):
    content = r(path)
    if old in content:
        w(path, content.replace(old, new, 1))
        print(f'  ✓ {label}')
        return True
    else:
        print(f'  ✗ {label} — anchor not found')
        idx = content.find(old[:40])
        if idx >= 0: print(f'    partial match at {idx}: {repr(content[idx:idx+80])}')
        return False

passed = 0
total  = 0

# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 1. useScheduleSettings.ts ===')
# ── 1a. Add presCheckHours to interface ──
total += 1
passed += patch(
    'src/components/dashboard/useScheduleSettings.ts',
    '  presDailyHours:     HoursMap;\n  ffDailyHours:       HoursMap;',
    '  presDailyHours:     HoursMap;\n  presCheckHours:     HoursMap;\n  ffDailyHours:       HoursMap;',
    'Add presCheckHours to ScheduleSettings interface'
)

# ── 1b. Add to DEFAULTS ──
total += 1
passed += patch(
    'src/components/dashboard/useScheduleSettings.ts',
    '  presDailyHours: {},\n  ffDailyHours: {},',
    '  presDailyHours: {},\n  presCheckHours: {},\n  ffDailyHours: {},',
    'Add presCheckHours to DEFAULTS'
)

# ── 1c. Add to KEYS ──
total += 1
passed += patch(
    'src/components/dashboard/useScheduleSettings.ts',
    "'mgrTotalHours','designDailyHours','ffDailyHours','presDailyHours',",
    "'mgrTotalHours','designDailyHours','ffDailyHours','presDailyHours','presCheckHours',",
    'Add presCheckHours to KEYS'
)

# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 2. SchedulePage.tsx ===')
SCHED = 'src/components/dashboard/SchedulePage.tsx'

# ── 2a. Extend PreservationSection props type ──
total += 1
passed += patch(
    SCHED,
    '  presDailyHours:        Record<string, number[]>;\n  onPresDailyHoursChange:(h: Record<string, number[]>) => void;',
    '  presDailyHours:        Record<string, number[]>;\n  presCheckHours:        Record<string, number[]>;\n  onPresDailyHoursChange:(h: Record<string, number[]>) => void;\n  onPresCheckHoursChange:(h: Record<string, number[]>) => void;',
    'Add presCheckHours props to PreservationSection type'
)

# ── 2b. Destructure presCheckHours in PreservationSection ──
total += 1
passed += patch(
    SCHED,
    'function PreservationSection({ location, preservationQueue, countsLoading, teamActuals, onActualsSaved,\n  presHours, presDailyHours, onPresDailyHoursChange, presRoster',
    'function PreservationSection({ location, preservationQueue, countsLoading, teamActuals, onActualsSaved,\n  presHours, presDailyHours, presCheckHours, onPresDailyHoursChange, onPresCheckHoursChange, presRoster',
    'Destructure presCheckHours in PreservationSection'
)

# ── 2c. Add updateCheckHours helper after updateDailyHours ──
total += 1
passed += patch(
    SCHED,
    '''  function updateDailyHours(memberId: string, dayIdx: number, val: number) {
    const newHours = { ...presDailyHours, [memberId]: [...(presDailyHours[memberId] ?? Array(7).fill(0))] };
    newHours[memberId][dayIdx] = val;
    onPresDailyHoursChange(newHours);
  }''',
    '''  function updateDailyHours(memberId: string, dayIdx: number, val: number) {
    const newHours = { ...presDailyHours, [memberId]: [...(presDailyHours[memberId] ?? Array(7).fill(0))] };
    newHours[memberId][dayIdx] = val;
    onPresDailyHoursChange(newHours);
  }

  function updateCheckHours(memberId: string, dayIdx: number, val: number) {
    const newHours = { ...presCheckHours, [memberId]: [...(presCheckHours[memberId] ?? Array(7).fill(0))] };
    newHours[memberId][dayIdx] = val;
    onPresCheckHoursChange(newHours);
  }''',
    'Add updateCheckHours helper'
)

# ── 2d. Replace the press hours input cell to add check hours input alongside ──
total += 1
passed += patch(
    SCHED,
    '''                              <input type="number" value={prodH || ''} placeholder="0" min="0" step="0.5"
                                title={m.isManager ? 'Production hours' : 'Hours'}
                                onChange={e => updateDailyHours(m.id, di, parseFloat(e.target.value) || 0)}
                                className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />''',
    '''                              <div className="flex items-center gap-1">
                                <div className="flex flex-col items-center">
                                  <span className="text-[8px] text-slate-300 mb-0.5">press</span>
                                  <input type="number" value={prodH || ''} placeholder="0" min="0" step="0.5"
                                    title={m.isManager ? 'Production hours' : 'Press hours'}
                                    onChange={e => updateDailyHours(m.id, di, parseFloat(e.target.value) || 0)}
                                    className="w-12 border border-slate-200 rounded px-1 py-1 text-center text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className="text-[8px] text-teal-400 mb-0.5">chk</span>
                                  <input type="number" value={(presCheckHours[m.id]?.[di] || '')} placeholder="0" min="0" step="0.5"
                                    title="Check hours"
                                    onChange={e => updateCheckHours(m.id, di, parseFloat(e.target.value) || 0)}
                                    className="w-12 border border-teal-200 rounded px-1 py-1 text-center text-teal-700 bg-teal-50/50 focus:outline-none focus:ring-1 focus:ring-teal-300" />
                                </div>
                              </div>''',
    'Add check hours input alongside press hours in This Week table'
)

# ── 2e. Update orders/cost/cpo cell calculation to include check hours in cost ──
total += 1
passed += patch(
    SCHED,
    '''                          const prodH = presDailyHours[m.id]?.[di] ?? 0;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? prodH) : prodH;
                          const orders = m.ratio > 0 ? prodH / m.ratio : 0;
                          const hasRate = m.rate > 0 || m.annualSalary > 0;
                          const cost = m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate;
                          const cpo = !m.isManager && hasRate && orders > 0 && cost > 0 ? cost / orders : null;''',
    '''                          const prodH = presDailyHours[m.id]?.[di] ?? 0;
                          const checkH = presCheckHours[m.id]?.[di] ?? 0;
                          const totalProdH = prodH + checkH;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? totalProdH) : totalProdH;
                          const orders = m.ratio > 0 ? prodH / m.ratio : 0;
                          const hasRate = m.rate > 0 || m.annualSalary > 0;
                          const cost = m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate;
                          const cpo = !m.isManager && hasRate && orders > 0 && cost > 0 ? cost / orders : null;''',
    'Include check hours in cost/CPO calculation'
)

# ── 2f. Add check hrs needed line in Daily capacity cell ──
total += 1
passed += patch(
    SCHED,
    '''                            <div className="text-indigo-700">{Math.round(cap * 100) / 100} ord</div>
                            {est > 0 && (
                              <div className={`text-[10px] font-medium ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                {diff > 0 ? '+' : ''}{Math.round(diff * 100) / 100} vs est.
                              </div>
                            )}
                            {dayRatio !== null && <div className="text-[10px] text-slate-500">{Math.round(dayRatio * 100) / 100} h/ord</div>}
                            {dayCPO !== null && <div className="text-[10px] text-amber-600">{fmt$(dayCPO)}</div>}''',
    '''                            <div className="text-indigo-700">{Math.round(cap * 100) / 100} ord</div>
                            {est > 0 && (
                              <div className={`text-[10px] font-medium ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                {diff > 0 ? '+' : ''}{Math.round(diff * 100) / 100} vs est.
                              </div>
                            )}
                            {(() => {
                              const checksData = checksOnDay(d.iso);
                              const checkHrsNeeded = ((checksData.c1[0] * c1Mins) + (checksData.c2[0] * c2Mins) + (checksData.c3[0] * c3Mins)) / 60;
                              const checkHrsScheduled = team.reduce((s, m) => s + (presCheckHours[m.id]?.[di] ?? 0), 0);
                              if (checkHrsNeeded <= 0 && checkHrsScheduled <= 0) return null;
                              const checkDiff = checkHrsScheduled - checkHrsNeeded;
                              return (
                                <div className="flex flex-col items-center gap-0.5 border-t border-teal-100 mt-0.5 pt-0.5">
                                  <div className="text-[10px] text-teal-600 font-medium">
                                    {Math.round(checkHrsScheduled * 10) / 10}h chk
                                  </div>
                                  {checkHrsNeeded > 0 && (
                                    <div className={`text-[9px] font-medium ${checkDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      {checkDiff >= 0 ? '+' : ''}{Math.round(checkDiff * 10) / 10} vs {Math.round(checkHrsNeeded * 10) / 10}h need
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {dayRatio !== null && <div className="text-[10px] text-slate-500">{Math.round(dayRatio * 100) / 100} h/ord</div>}
                            {dayCPO !== null && <div className="text-[10px] text-amber-600">{fmt$(dayCPO)}</div>}''',
    'Add check hrs needed/scheduled indicator in Daily capacity cell'
)

# ── 2g. Wire presCheckHours state in main component ──
total += 1
passed += patch(
    SCHED,
    "  const [presDailyHours, setPresDailyHours] = useState<Record<string, number[]>>(settings.presDailyHours ?? {});",
    "  const [presDailyHours, setPresDailyHours] = useState<Record<string, number[]>>(settings.presDailyHours ?? {});\n  const [presCheckHours, setPresCheckHours] = useState<Record<string, number[]>>(settings.presCheckHours ?? {});",
    'Add presCheckHours state in main component'
)

# ── 2h. Sync presCheckHours from settings ──
total += 1
passed += patch(
    SCHED,
    "  useEffect(() => { if (settings.presDailyHours && Object.keys(settings.presDailyHours).length > 0) setPresDailyHours(settings.presDailyHours); }, [JSON.stringify(settings.presDailyHours)]); // eslint-disable-line react-hooks/exhaustive-deps",
    "  useEffect(() => { if (settings.presDailyHours && Object.keys(settings.presDailyHours).length > 0) setPresDailyHours(settings.presDailyHours); }, [JSON.stringify(settings.presDailyHours)]); // eslint-disable-line react-hooks/exhaustive-deps\n  useEffect(() => { if (settings.presCheckHours && Object.keys(settings.presCheckHours).length > 0) setPresCheckHours(settings.presCheckHours); }, [JSON.stringify(settings.presCheckHours)]); // eslint-disable-line react-hooks/exhaustive-deps",
    'Sync presCheckHours from settings'
)

# ── 2i. Pass presCheckHours to PreservationSection ──
total += 1
passed += patch(
    SCHED,
    "          presDailyHours={presDailyHours}\n          onPresDailyHoursChange={(h) => { setPresDailyHours(h); update('presDailyHours', h); }}",
    "          presDailyHours={presDailyHours}\n          presCheckHours={presCheckHours}\n          onPresDailyHoursChange={(h) => { setPresDailyHours(h); update('presDailyHours', h); }}\n          onPresCheckHoursChange={(h) => { setPresCheckHours(h); update('presCheckHours', h); }}",
    'Pass presCheckHours to PreservationSection'
)

# ── 2j. Update dayTotals to include check hours ──
total += 1
passed += patch(
    SCHED,
    "  const dayTotals = Array.from({ length: 7 }, (_, di) =>\n    team.reduce((s, m) => s + (m.ratio > 0 ? (presDailyHours[m.id]?.[di] ?? 0) / m.ratio : 0), 0)\n  );",
    "  const dayTotals = Array.from({ length: 7 }, (_, di) =>\n    team.reduce((s, m) => s + (m.ratio > 0 ? (presDailyHours[m.id]?.[di] ?? 0) / m.ratio : 0), 0)\n  );\n  // Total check hours scheduled per day\n  const checkDayTotals = Array.from({ length: 7 }, (_, di) =>\n    team.reduce((s, m) => s + (presCheckHours[m.id]?.[di] ?? 0), 0)\n  );",
    'Add checkDayTotals array'
)

# ── 2k. Update dayCost to include check hours in cost ──
total += 1
passed += patch(
    SCHED,
    '''                        const dayCost = team.reduce((s, m) => {
                          if (m.rate === 0 && m.annualSalary === 0) return s;
                          if ((presRoster[m.id] as {excludeFromCost?: boolean})?.excludeFromCost) return s;
                          const prodH = presDailyHours[m.id]?.[di] ?? 0;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? prodH) : prodH;
                          return s + (m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate);
                        }, 0);''',
    '''                        const dayCost = team.reduce((s, m) => {
                          if (m.rate === 0 && m.annualSalary === 0) return s;
                          if ((presRoster[m.id] as {excludeFromCost?: boolean})?.excludeFromCost) return s;
                          const prodH = presDailyHours[m.id]?.[di] ?? 0;
                          const chkH  = presCheckHours[m.id]?.[di] ?? 0;
                          const totalH = m.isManager ? (mgrTotalHours[m.id]?.[di] ?? (prodH + chkH)) : (prodH + chkH);
                          return s + (m.payType === 'salary' ? m.annualSalary / 260 : totalH * m.rate);
                        }, 0);''',
    'Include check hours in dayCost'
)

# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 3. hours-upload/route.ts ===')
UPLOAD = 'src/app/api/admin/hours-upload/route.ts'
total += 1
passed += patch(
    UPLOAD,
    "  if (l.includes('design'))        return 'design';\n  if (l.includes('preservation'))  return 'preservation';\n  if (l.includes('fulfillment'))   return 'fulfillment';\n  return raw.toLowerCase();",
    "  if (l.includes('design'))        return 'design';\n  if (l.includes('preservation'))  return 'preservation';\n  if (l.includes('fulfillment'))   return 'fulfillment';\n  if (l.includes('checks') || l.includes('unboxing')) return 'checks_unboxing';\n  return raw.toLowerCase();",
    'Add checks_unboxing to normalizeDept'
)

total += 1
passed += patch(
    UPLOAD,
    "      if (!['design', 'preservation', 'fulfillment'].includes(dept)) continue;",
    "      if (!['design', 'preservation', 'fulfillment', 'checks_unboxing'].includes(dept)) continue;",
    'Allow checks_unboxing through dept filter'
)

# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 4. useActualsWithPayroll.ts ===')
PAYROLL = 'src/components/dashboard/useActualsWithPayroll.ts'

# Include Checks & Unboxing in Preservation dept cost
total += 1
passed += patch(
    PAYROLL,
    "    for (const dept of depts) {\n      const deptRows = weekRows.filter(r => r.department === dept ||",
    "    for (const dept of depts) {\n      const deptRows = weekRows.filter(r => r.department === dept ||\n        // Checks & Unboxing hours roll into Preservation cost\n        (dept === 'Preservation' && (r.department === 'Checks & Unboxing' || r.department.toLowerCase().includes('checks') || r.department.toLowerCase().includes('unboxing'))) ||",
    'Roll Checks & Unboxing into Preservation cost'
)

# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 5. HistoricalsSection.tsx ===')
HIST = 'src/components/dashboard/HistoricalsSection.tsx'

# ── 5a. Also fetch checks_unboxing actuals when dept is preservation ──
total += 1
passed += patch(
    HIST,
    "  // Filter to this dept\n  const deptActuals = useMemo(() =>\n    enrichedActuals.filter(r => r.department === department),\n    [enrichedActuals, department]\n  );",
    "  // Filter to this dept — for preservation also include checks_unboxing rows\n  const deptActuals = useMemo(() =>\n    enrichedActuals.filter(r =>\n      r.department === department ||\n      (department === 'preservation' && r.department === 'checks_unboxing')\n    ),\n    [enrichedActuals, department]\n  );\n\n  // Separate checks_unboxing rows for display tinting\n  const checksUnboxingActuals = useMemo(() =>\n    department === 'preservation'\n      ? enrichedActuals.filter(r => r.department === 'checks_unboxing')\n      : [],\n    [enrichedActuals, department]\n  );",
    'Include checks_unboxing in deptActuals for preservation'
)

# ── 5b. Add isChecksUnboxing flag to cell rendering ──
total += 1
passed += patch(
    HIST,
    "                    {allWeeks.map(w => {\n                      const isPast = new Date(w + 'T12:00:00') <= today;\n                      const e = getEntry(w, name);",
    "                    {allWeeks.map(w => {\n                      const isPast = new Date(w + 'T12:00:00') <= today;\n                      const e = getEntry(w, name);\n                      // Check if this member has checks_unboxing hours this week\n                      const cuHours = department === 'preservation'\n                        ? checksUnboxingActuals.filter(r => r.week_of === w && r.member_name === name).reduce((s, r) => s + r.actual_hours, 0)\n                        : 0;",
    'Add cuHours calculation per cell'
)

# ── 5c. Show checks_unboxing hours in teal below the regular hours input ──
total += 1
passed += patch(
    HIST,
    "                            {member?.isManager && member.payType === 'hourly' && (\n                              <input type=\"number\" min=\"0\" step=\"0.5\"\n                                value={managerHours[`${w}:${name}`] ?? ''}\n                                placeholder=\"mgr h\"\n                                title=\"Additional manager hours (non-production)\"\n                                onChange={ev => setManagerHours(prev => ({ ...prev, [`${w}:${name}`]: parseFloat(ev.target.value) || 0 }))}\n                                className=\"hist-input w-full px-2 py-0.5 text-center text-[9px] bg-violet-50 border-none outline-none border-t border-t-violet-100 text-violet-500 placeholder:text-violet-300\"\n                              />\n                            )}",
    "                            {member?.isManager && member.payType === 'hourly' && (\n                              <input type=\"number\" min=\"0\" step=\"0.5\"\n                                value={managerHours[`${w}:${name}`] ?? ''}\n                                placeholder=\"mgr h\"\n                                title=\"Additional manager hours (non-production)\"\n                                onChange={ev => setManagerHours(prev => ({ ...prev, [`${w}:${name}`]: parseFloat(ev.target.value) || 0 }))}\n                                className=\"hist-input w-full px-2 py-0.5 text-center text-[9px] bg-violet-50 border-none outline-none border-t border-t-violet-100 text-violet-500 placeholder:text-violet-300\"\n                              />\n                            )}\n                            {cuHours > 0 && (\n                              <div className=\"w-full px-2 py-0.5 text-center text-[9px] bg-teal-50 border-t border-t-teal-100 text-teal-600 font-medium\" title=\"Checks & Unboxing hours\">\n                                +{cuHours.toFixed(1)}h C&U\n                              </div>\n                            )}",
    'Show Checks & Unboxing hours in teal per cell'
)

# ── 5d. Include checks_unboxing hours in ratio calculation in week totals ──
total += 1
passed += patch(
    HIST,
    "                  const nonMgrHours = allDisplayMembers.reduce((s, name) => {\n                    const m = members.find(m => m.name === name);\n                    if (m?.isManager) return s;\n                    return s + getEntry(w, name).hours;\n                  }, 0);",
    "                  const nonMgrHours = allDisplayMembers.reduce((s, name) => {\n                    const m = members.find(m => m.name === name);\n                    if (m?.isManager) return s;\n                    // Include checks_unboxing hours in ratio calc for preservation\n                    const cuH = department === 'preservation'\n                      ? checksUnboxingActuals.filter(r => r.week_of === w && r.member_name === name).reduce((acc, r) => acc + r.actual_hours, 0)\n                      : 0;\n                    return s + getEntry(w, name).hours + cuH;\n                  }, 0);",
    'Include checks_unboxing hours in ratio calculation'
)

# ─────────────────────────────────────────────────────────────────────────────
print(f'\n{"="*50}')
print(f'Total: {passed}/{total} patches applied')
if passed < total:
    print('Some patches failed — check anchors above')
else:
    print('All patches applied!')
    print('\nNext step: npx tsc --noEmit')
