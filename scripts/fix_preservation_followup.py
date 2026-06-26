#!/usr/bin/env python3
import sys

PATH = "src/components/dashboard/SchedulePage.tsx"
APPLY = "--apply" in sys.argv

with open(PATH, "r") as f:
    content = f.read()

old = """  function updateDailyHours(memberId: string, dayIdx: number, val: number) {
    const newHours = { ...presDailyHours, [memberId]: [...(presDailyHours[memberId] ?? Array(7).fill(0))] };
    newHours[memberId][dayIdx] = val;
    onPresDailyHoursChange(newHours);
  }

  function updateCheckHours(memberId: string, dayIdx: number, val: number) {
    const newHours = { ...presCheckHours, [memberId]: [...(presCheckHours[memberId] ?? Array(7).fill(0))] };
    newHours[memberId][dayIdx] = val;
    onPresCheckHoursChange(newHours);
  }"""

new = """  function updateDailyHours(memberId: string, dayIdx: number, val: number) {
    const key = `${presThisWeekOffset}-${memberId}`;
    const newHours = { ...presDailyHours, [key]: [...(presDailyHours[key] ?? Array(7).fill(0))] };
    newHours[key][dayIdx] = val;
    onPresDailyHoursChange(newHours);
  }

  function updateCheckHours(memberId: string, dayIdx: number, val: number) {
    const key = `${presThisWeekOffset}-${memberId}`;
    const newHours = { ...presCheckHours, [key]: [...(presCheckHours[key] ?? Array(7).fill(0))] };
    newHours[key][dayIdx] = val;
    onPresCheckHoursChange(newHours);
  }"""

count = content.count(old)
print(f"Found {count} occurrence(s).")
if count != 1:
    print("Expected exactly 1 — not applying. Paste the repr() output again if this fails.")
    sys.exit(1)

content = content.replace(old, new)

if APPLY:
    with open(PATH, "w") as f:
        f.write(content)
    print(f"✅ Applied and written to {PATH}")
else:
    print("Dry run OK. Re-run with --apply to write.")
