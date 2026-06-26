#!/usr/bin/env python3
import sys

PATH = "src/app/api/my-dashboard/route.ts"
APPLY = "--apply" in sys.argv

with open(PATH, "r") as f:
    content = f.read()

old = """  function getDailyHours(dept: string, dailyKey: string, id: string): number[] {
    const raw = scheduleMap[dailyKey] ?? {};
    const arr = dept === 'resin' ? raw[`0-${id}`] : raw[id];
    return Array.isArray(arr) ? (arr as number[]).slice(0, 5) : [];
  }"""

new = """  function getDailyHours(dept: string, dailyKey: string, id: string): number[] {
    const raw = scheduleMap[dailyKey] ?? {};
    // All depts now store daily hours keyed `${weekOffset}-${memberId}`; "this week" = offset 0.
    const arr = raw[`0-${id}`];
    return Array.isArray(arr) ? (arr as number[]).slice(0, 5) : [];
  }"""

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
