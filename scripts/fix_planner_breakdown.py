#!/usr/bin/env python3
import sys

PATH = "src/components/dashboard/MyDashboardClient.tsx"
APPLY = "--apply" in sys.argv

with open(PATH, "r") as f:
    content = f.read()

old = """                {(data?.upcomingWeeks ?? []).map((w, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">Week of {fmtDate(w.weekOf)}</span>
                    <div className="flex items-center gap-2">
                      {(w.crossDept ?? []).map((cd, j) => (
                        <span key={j} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 capitalize">
                          +{cd.hours}h {cd.dept}
                        </span>
                      ))}
                      <span className="text-sm text-gray-500">
                        {w.scheduledHours !== null ? `${w.scheduledHours} hrs total` : "— hrs scheduled"}
                      </span>
                    </div>
                  </div>
                ))}"""

new = """                {(data?.upcomingWeeks ?? []).map((w, i) => {
                  const crossTotal = (w.crossDept ?? []).reduce((s, cd) => s + cd.hours, 0);
                  const homeHours = w.scheduledHours !== null ? Math.round((w.scheduledHours - crossTotal) * 10) / 10 : 0;
                  const breakdown: string[] = [];
                  if (homeHours > 0) breakdown.push(`${homeHours}h ${data?.homeDepartment ?? ''}`);
                  (w.crossDept ?? []).forEach(cd => breakdown.push(`${cd.hours}h ${cd.dept}`));
                  return (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600">Week of {fmtDate(w.weekOf)}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm text-gray-700 font-medium">
                          {w.scheduledHours !== null ? `${w.scheduledHours} hrs total` : "— hrs scheduled"}
                        </span>
                        {breakdown.length > 0 && (
                          <span className="text-xs text-gray-400 capitalize">{breakdown.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}"""

count = content.count(old)
print(f"Found {count} occurrence(s).")
if count != 1:
    print("Expected exactly 1 — not applying.")
    sys.exit(1)

content = content.replace(old, new)

if APPLY:
    with open(PATH, "w") as f:
        f.write(content)
    print(f"✅ Applied and written to {PATH}")
else:
    print("Dry run OK. Re-run with --apply to write.")
