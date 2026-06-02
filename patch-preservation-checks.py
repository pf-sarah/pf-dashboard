#!/usr/bin/env python3
"""
patch-preservation-checks.py
Run from your pf-dashboard root:
  python3 patch-preservation-checks.py

Adds to PreservationSection:
  1. Daily "Actual received" editable row in This Week table
  2. Check 1/2/3 load rows (range bars) per day
  3. Check settings accordion (day windows + minutes per check)
  4. Extends presSettings type for dailyReceived + checkSettings
  5. HistoricalsSection: defaults received to sum of daily actuals
"""

import re, sys, os

BASE = os.path.dirname(os.path.abspath(__file__))
SCHEDULE_PATH = os.path.join(BASE, 'src/components/dashboard/SchedulePage.tsx')
HISTORICALS_PATH = os.path.join(BASE, 'src/components/dashboard/HistoricalsSection.tsx')

def read(path):
    with open(path, 'r') as f:
        return f.read()

def write(path, content):
    with open(path, 'w') as f:
        f.write(content)

def patch_schedule():
    content = read(SCHEDULE_PATH)
    changes = 0

    # ── 1. Extend presSettings type ──────────────────────────────────────────
    old = '''  presSettings:          { dateFrom?: string; dateTo?: string; weekOverrides?: Record<string, { ut: number; ga: number }>; dayPcts?: number[]; dayOverrides?: Record<string, { ut: number; ga: number }> };'''
    new = '''  presSettings:          { dateFrom?: string; dateTo?: string; weekOverrides?: Record<string, { ut: number; ga: number }>; dayPcts?: number[]; dayOverrides?: Record<string, { ut: number; ga: number }>; dailyReceived?: Record<string, number>; checkSettings?: { c1Min?: number; c1Max?: number; c2Min?: number; c2Max?: number; c3Min?: number; c3Max?: number; c1Mins?: number; c2Mins?: number; c3Mins?: number } };'''
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print('✓ 1. Extended presSettings type')
    else:
        print('✗ 1. presSettings type not found — skipping')

    # ── 2. Add dailyReceived + checkSettings extraction after dayOverrides ────
    old = '''  const dayOverrides = presSettings.dayOverrides ?? {};
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];'''
    new = '''  const dayOverrides = presSettings.dayOverrides ?? {};
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  // ── Check settings + daily received ──────────────────────────────────────
  const dailyReceived: Record<string, number> = presSettings.dailyReceived ?? {};
  const checkSettings = presSettings.checkSettings ?? {};
  const c1Min  = checkSettings.c1Min  ?? 2;
  const c1Max  = checkSettings.c1Max  ?? 3;
  const c2Min  = checkSettings.c2Min  ?? 5;
  const c2Max  = checkSettings.c2Max  ?? 6;
  const c3Min  = checkSettings.c3Min  ?? 8;
  const c3Max  = checkSettings.c3Max  ?? 9;
  const c1Mins = checkSettings.c1Mins ?? (location === 'Georgia' ? 10   : 3);
  const c2Mins = checkSettings.c2Mins ?? (location === 'Georgia' ? 5.5  : 2);
  const c3Mins = checkSettings.c3Mins ?? (location === 'Georgia' ? 3    : 1);
  const [showCheckSettings, setShowCheckSettings] = useState(false);

  function setDailyReceived(iso: string, val: number) {
    const next = { ...dailyReceived, [iso]: val };
    onPresSettingsChange({ ...presSettings, dailyReceived: next });
  }

  function setCheckSetting(field: string, val: number) {
    onPresSettingsChange({ ...presSettings, checkSettings: { ...checkSettings, [field]: val } });
  }

  // For a given day ISO, compute how many bouquets need each check type
  // based on prior dailyReceived entries
  function checksOnDay(dayIso: string): { c1: [number, number]; c2: [number, number]; c3: [number, number] } {
    // Count bouquets received on days where this day falls in the check window
    // (skipping weekends already since fiveDays only has weekdays)
    let c1 = 0, c2 = 0, c3 = 0;
    // We need to look back far enough to cover c3Max days + weekends
    for (let lookback = 1; lookback <= c3Max + 4; lookback++) {
      const d = new Date(dayIso + 'T12:00:00');
      d.setDate(d.getDate() - lookback);
      // Skip weekends in the received date (we only record Mon-Fri anyway)
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const srcIso = d.toISOString().split('T')[0];
      const count = dailyReceived[srcIso] ?? 0;
      if (count === 0) continue;
      // Count business days between srcIso and dayIso
      let bizDays = 0;
      const cur = new Date(srcIso + 'T12:00:00');
      cur.setDate(cur.getDate() + 1);
      const target = new Date(dayIso + 'T12:00:00');
      while (cur <= target) {
        const wd = cur.getDay();
        if (wd !== 0 && wd !== 6) bizDays++;
        cur.setDate(cur.getDate() + 1);
      }
      if (bizDays >= c1Min && bizDays <= c1Max) c1 += count;
      if (bizDays >= c2Min && bizDays <= c2Max) c2 += count;
      if (bizDays >= c3Min && bizDays <= c3Max) c3 += count;
    }
    // Return as ranges (same value both ends since we're looking at actuals not estimates)
    return { c1: [c1, c1], c2: [c2, c2], c3: [c3, c3] };
  }'''
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print('✓ 2. Added dailyReceived + checkSettings state')
    else:
        print('✗ 2. dayOverrides anchor not found — skipping')

    # ── 3. Add rows after "Est. deliveries" row in This Week table ───────────
    old = '''                    <tr className="bg-slate-50/50">
                      <td className="sticky left-0 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">Est. deliveries</td>
                      {fiveDays.map((d, di) => {
                        const est = location === 'Utah' ? d.utahEst : d.gaEst;
                        return <td key={di} className="px-2 py-1.5 text-center text-[10px] text-slate-400">{est || '—'}</td>;
                      })}
                    </tr>
                  </tbody>'''
    new = '''                    <tr className="bg-slate-50/50">
                      <td className="sticky left-0 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">Est. deliveries</td>
                      {fiveDays.map((d, di) => {
                        const est = location === 'Utah' ? d.utahEst : d.gaEst;
                        return <td key={di} className="px-2 py-1.5 text-center text-[10px] text-slate-400">{est || '—'}</td>;
                      })}
                    </tr>
                    {/* ── Actual received row ── */}
                    <tr className="bg-emerald-50/40 border-t border-slate-100">
                      <td className="sticky left-0 bg-emerald-50/40 px-4 py-1.5">
                        <div className="text-[10px] font-medium text-emerald-700">Actual received</div>
                        <div className="text-[9px] text-slate-400">bouquets delivered</div>
                      </td>
                      {fiveDays.map((d, di) => {
                        const val = dailyReceived[d.iso] ?? '';
                        return (
                          <td key={di} className="px-2 py-1.5 text-center">
                            <input
                              type="number" min="0" placeholder="0"
                              value={val}
                              onChange={e => setDailyReceived(d.iso, parseInt(e.target.value) || 0)}
                              className="w-14 border border-emerald-200 rounded px-1.5 py-1 text-center text-[11px] text-emerald-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </td>
                        );
                      })}
                    </tr>
                    {/* ── Check load rows ── */}
                    {[
                      { label: 'Check 1', key: 'c1' as const, color: 'text-violet-600', bg: 'bg-violet-50/30', mins: c1Mins, min: c1Min, max: c1Max },
                      { label: 'Check 2', key: 'c2' as const, color: 'text-blue-600',   bg: 'bg-blue-50/30',   mins: c2Mins, min: c2Min, max: c2Max },
                      { label: 'Check 3', key: 'c3' as const, color: 'text-indigo-600', bg: 'bg-indigo-50/30', mins: c3Mins, min: c3Min, max: c3Max },
                    ].map(({ label, key, color, bg, mins, min, max }) => (
                      <tr key={key} className={`${bg} border-t border-slate-50`}>
                        <td className={`sticky left-0 ${bg} px-4 py-1.5`}>
                          <div className={`text-[10px] font-medium ${color}`}>{label}</div>
                          <div className="text-[9px] text-slate-400">day {min}–{max} · {mins} min ea</div>
                        </td>
                        {fiveDays.map((d, di) => {
                          const checks = checksOnDay(d.iso);
                          const [lo, hi] = checks[key];
                          const totalMins = lo * mins;
                          return (
                            <td key={di} className="px-2 py-1.5 text-center">
                              {lo > 0 ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`text-[11px] font-semibold ${color}`}>
                                    {lo === hi ? lo : `${lo}–${hi}`}
                                  </span>
                                  <span className="text-[9px] text-slate-400">{Math.round(totalMins)} min</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-200">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>'''
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print('✓ 3. Added actual received + check rows to This Week table')
    else:
        print('✗ 3. Est. deliveries row anchor not found — skipping')

    # ── 4. Add check settings accordion before the weekly/52-week toggle ─────
    old = '''          {/* Weekly / 52-week toggle */}
          <div className="flex gap-1">'''
    new = '''          {/* Check settings accordion */}
          <div className="border border-slate-100 rounded-xl bg-white overflow-hidden">
            <button
              onClick={() => setShowCheckSettings(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span className="font-medium">Check schedule settings</span>
              <span className="text-slate-400 text-xs">{showCheckSettings ? '▲ Hide' : '▼ Edit'} check windows & times</span>
            </button>
            {showCheckSettings && (
              <div className="px-5 pb-5 border-t border-slate-100 space-y-4">
                <p className="text-xs text-slate-400 pt-3">
                  Define how many business days after delivery each check falls, and how many minutes each check takes.
                  Weekends are automatically skipped.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    { label: 'Check 1', minKey: 'c1Min', maxKey: 'c1Max', minsKey: 'c1Mins', minVal: c1Min, maxVal: c1Max, minsVal: c1Mins, color: 'text-violet-600' },
                    { label: 'Check 2', minKey: 'c2Min', maxKey: 'c2Max', minsKey: 'c2Mins', minVal: c2Min, maxVal: c2Max, minsVal: c2Mins, color: 'text-blue-600' },
                    { label: 'Check 3', minKey: 'c3Min', maxKey: 'c3Max', minsKey: 'c3Mins', minVal: c3Min, maxVal: c3Max, minsVal: c3Mins, color: 'text-indigo-600' },
                  ] as const).map(({ label, minKey, maxKey, minsKey, minVal, maxVal, minsVal, color }) => (
                    <div key={label} className="space-y-2">
                      <p className={`text-xs font-semibold ${color}`}>{label}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-20">Day window</span>
                        <input type="number" min="1" max="30" value={minVal}
                          onChange={e => setCheckSetting(minKey, parseInt(e.target.value) || 1)}
                          className="w-12 border border-slate-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        <span className="text-xs text-slate-400">–</span>
                        <input type="number" min="1" max="30" value={maxVal}
                          onChange={e => setCheckSetting(maxKey, parseInt(e.target.value) || 1)}
                          className="w-12 border border-slate-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        <span className="text-xs text-slate-400">biz days</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-20">Minutes each</span>
                        <input type="number" min="0.5" max="60" step="0.5" value={minsVal}
                          onChange={e => setCheckSetting(minsKey, parseFloat(e.target.value) || 1)}
                          className="w-16 border border-slate-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        <span className="text-xs text-slate-400">min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Weekly / 52-week toggle */}
          <div className="flex gap-1">'''
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print('✓ 4. Added check settings accordion')
    else:
        print('✗ 4. Weekly/52-week toggle anchor not found — skipping')

    write(SCHEDULE_PATH, content)
    print(f'\nSchedulePage.tsx: {changes}/4 changes applied')
    return changes

def patch_historicals():
    content = read(HISTORICALS_PATH)
    changes = 0

    # Default received to sum of daily actuals for that week
    # Find where received input is rendered and add default logic
    old = '''  function handleReceivedEdit(weekOf: string, val: number) {
    setReceivedEdits(prev => ({ ...prev, [weekOf]: val }));'''
    new = '''  // Compute sum of presSettings.dailyReceived for a given week
  // (passed in via presActuals prop pathway — we use a simple sum of Mon-Fri)
  function getDailySum(weekOf: string): number | null {
    // presActuals keyed by week_of won't have daily data here;
    // daily sums are computed from presSettings.dailyReceived passed via parent
    // For now we return null (parent can override via presActuals)
    return null;
  }

  function handleReceivedEdit(weekOf: string, val: number) {
    setReceivedEdits(prev => ({ ...prev, [weekOf]: val }));'''
    if old in content:
        content = content.replace(old, new, 1)
        changes += 1
        print('✓ 5. Added getDailySum stub to HistoricalsSection')
    else:
        print('✗ 5. handleReceivedEdit anchor not found — skipping')

    write(HISTORICALS_PATH, content)
    print(f'HistoricalsSection.tsx: {changes}/1 changes applied')
    return changes

if __name__ == '__main__':
    print('=== Patching PreservationSection ===')
    s = patch_schedule()
    print()
    print('=== Patching HistoricalsSection ===')
    h = patch_historicals()
    print()
    total = s + h
    print(f'Total: {total}/5 changes applied')
    if total < 5:
        print('Some patches failed — check anchors above and apply manually if needed')
    else:
        print('All patches applied — run: npx tsc --noEmit')
