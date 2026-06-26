#!/usr/bin/env python3
import sys

PATH = "src/components/dashboard/SchedulePage.tsx"
APPLY = "--apply" in sys.argv

with open(PATH, "r") as f:
    content = f.read()

changes = []

def blanket(old_pattern, new_pattern, label):
    global content
    count = content.count(old_pattern)
    if count == 0:
        print(f"⚠️  {label}: pattern not found (0 occurrences) — skipping")
        return
    content = content.replace(old_pattern, new_pattern)
    changes.append(f"{label} ({count}x)")

blanket(
    "presDailyHours[m.id]?.[di] ?? 0",
    "presDailyHours[`${presThisWeekOffset}-${m.id}`]?.[di] ?? 0",
    "preservation presDailyHours[m.id] reads",
)
blanket(
    "presCheckHours[m.id]?.[di] ?? 0",
    "presCheckHours[`${presThisWeekOffset}-${m.id}`]?.[di] ?? 0",
    "preservation presCheckHours[m.id] reads",
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
