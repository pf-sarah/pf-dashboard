#!/usr/bin/env python3
import sys

PATH = "src/components/dashboard/SchedulePage.tsx"
APPLY = "--apply" in sys.argv

with open(PATH, "r") as f:
    content = f.read()

changes = []

def patch(old, new, label):
    global content
    count = content.count(old)
    if count != 1:
        print(f"❌ MISMATCH ({label}): expected 1, found {count}")
        sys.exit(1)
    content = content.replace(old, new)
    changes.append(label)

# ── DESIGN ───────────────────────────────────────────────────────────────
patch(
    """            function getDH(id: string, di: number) { return designDailyHours[id]?.[di] ?? 0; }
            function setDH(id: string, di: number, val: number) {
              const prev = designDailyHours[id] ?? Array(5).fill(0);
              const next = { ...designDailyHours, [id]: prev.map((h: number, j: number) => j === di ? val : h) };
              setDesignDailyHours(next);
              update('designDailyHours', next);
            }""",
    """            function getDH(id: string, di: number) { return designDailyHours[`${designThisWeekOffset}-${id}`]?.[di] ?? 0; }
            function setDH(id: string, di: number, val: number) {
              const key = `${designThisWeekOffset}-${id}`;
              const prev = designDailyHours[key] ?? Array(5).fill(0);
              const next = { ...designDailyHours, [key]: prev.map((h: number, j: number) => j === di ? val : h) };
              setDesignDailyHours(next);
              update('designDailyHours', next);
            }""",
    label="design getDH/setDH",
)

patch(
    """  useEffect(() => {
    const init: Record<string, number[]> = {};
    designers.forEach(d => {
      const weeklyHrs = schedule[0]?.[d.id] ?? 0;
      if (weeklyHrs > 0) init[d.id] = distributeHours(weeklyHrs);
    });
    if (Object.keys(init).length > 0) setDesignDailyHours(prev => {
      // Only pre-populate members that have no saved entry at all
      const merged = { ...init };
      Object.keys(prev).forEach(id => { merged[id] = prev[id]; });
      return merged;
    });
  }, [designers.length, location]); // eslint-disable-line react-hooks/exhaustive-deps""",
    """  useEffect(() => {
    const init: Record<string, number[]> = {};
    designers.forEach(d => {
      const weeklyHrs = schedule[0]?.[d.id] ?? 0;
      if (weeklyHrs > 0) init[`0-${d.id}`] = distributeHours(weeklyHrs);
    });
    if (Object.keys(init).length > 0) setDesignDailyHours(prev => {
      // Only pre-populate members that have no saved entry at all
      const merged = { ...init };
      Object.keys(prev).forEach(id => { merged[id] = prev[id]; });
      return merged;
    });
  }, [designers.length, location]); // eslint-disable-line react-hooks/exhaustive-deps""",
    label="design pre-populate effect",
)

# ── FULFILLMENT ──────────────────────────────────────────────────────────
patch(
    """        function getFFH(id: string, di: number) { return ffDailyHours[id]?.[di] ?? 0; }
        function setFFH(id: string, di: number, val: number) {
          const prev = ffDailyHours[id] ?? Array(5).fill(0);
          const next = { ...ffDailyHours, [id]: prev.map((h: number, j: number) => j === di ? val : h) };
          setFfDailyHours(next);
          onFfDailyHoursChange?.(next);
        }""",
    """        function getFFH(id: string, di: number) { return ffDailyHours[`${ffThisWeekOffset}-${id}`]?.[di] ?? 0; }
        function setFFH(id: string, di: number, val: number) {
          const key = `${ffThisWeekOffset}-${id}`;
          const prev = ffDailyHours[key] ?? Array(5).fill(0);
          const next = { ...ffDailyHours, [key]: prev.map((h: number, j: number) => j === di ? val : h) };
          setFfDailyHours(next);
          onFfDailyHoursChange?.(next);
        }""",
    label="fulfillment getFFH/setFFH",
)

patch(
    """                      const ffDayHours = team.reduce((s, m) => s + (ffDailyHours[m.id]?.[di] ?? 0), 0);""",
    """                      const ffDayHours = team.reduce((s, m) => s + (ffDailyHours[`${ffThisWeekOffset}-${m.id}`]?.[di] ?? 0), 0);""",
    label="fulfillment ffDayHours total",
)

patch(
    """  useEffect(() => {
    const init: Record<string, number[]> = {};
    (location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM).forEach(m => {
      const weeklyHrs = ffHours[m.id]?.[0] ?? 0;
      if (weeklyHrs > 0) init[m.id] = distributeHours(weeklyHrs);
    });
    Object.keys(ffRoster).forEach(id => {
      if (!init[id]) {
        const weeklyHrs = ffHours[id]?.[0] ?? 0;
        if (weeklyHrs > 0) init[id] = distributeHours(weeklyHrs);
      }
    });
    if (Object.keys(init).length > 0) setFfDailyHours(prev => {
      // Only pre-populate members that have no saved entry at all
      const merged = { ...init };
      Object.keys(prev).forEach(id => { merged[id] = prev[id]; });
      return merged;
    });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps""",
    """  useEffect(() => {
    const init: Record<string, number[]> = {};
    (location === 'Utah' ? UTAH_FULFILLMENT_TEAM : GEORGIA_FULFILLMENT_TEAM).forEach(m => {
      const weeklyHrs = ffHours[m.id]?.[0] ?? 0;
      if (weeklyHrs > 0) init[`0-${m.id}`] = distributeHours(weeklyHrs);
    });
    Object.keys(ffRoster).forEach(id => {
      if (!init[`0-${id}`]) {
        const weeklyHrs = ffHours[id]?.[0] ?? 0;
        if (weeklyHrs > 0) init[`0-${id}`] = distributeHours(weeklyHrs);
      }
    });
    if (Object.keys(init).length > 0) setFfDailyHours(prev => {
      // Only pre-populate members that have no saved entry at all
      const merged = { ...init };
      Object.keys(prev).forEach(id => { merged[id] = prev[id]; });
      return merged;
    });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps""",
    label="fulfillment pre-populate effect",
)

print(f"\n{'APPLYING' if APPLY else 'DRY RUN'} {len(changes)} changes:")
for c in changes:
    print(f"  ✓ {c}")

if APPLY:
    with open(PATH, "w") as f:
        f.write(content)
    print(f"\n✅ Written to {PATH}")
else:
    print("\nRe-run with --apply to write changes.")
