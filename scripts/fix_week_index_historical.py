import sys

PATH = "src/components/dashboard/useHistoricalMetrics.ts"

OLD = """function getWeekIndex(isoMonday: string): number {
  const start = new Date('2025-12-29T12:00:00');
  const d     = new Date(isoMonday + 'T12:00:00');
  return Math.round((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}"""

NEW = """function getWeekIndex(isoMonday: string): number {
  // IMPORTANT: scheduledHours arrays (designHours/ffHours/presHours) are indexed
  // relative to "this week" (today's Monday), NOT a fixed calendar epoch.
  // Must match the convention used in SchedulePage.tsx (weekOffset / w=0) and
  // the corresponding getWeekIdxOffset in kpis/route.ts.
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setDate(thisMonday.getDate() + diff);
  thisMonday.setHours(12, 0, 0, 0);
  const d = new Date(isoMonday + 'T12:00:00');
  return Math.round((d.getTime() - thisMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}"""

def main():
    apply = "--apply" in sys.argv
    with open(PATH, "r") as f:
        content = f.read()

    count = content.count(OLD)
    assert count == 1, f"Expected exactly 1 match, found {count}"

    if not apply:
        print(f"[DRY RUN] Found {count} match in {PATH}. Re-run with --apply to write changes.")
        print("\n--- OLD ---")
        print(OLD)
        print("\n--- NEW ---")
        print(NEW)
        return

    new_content = content.replace(OLD, NEW)
    with open(PATH, "w") as f:
        f.write(new_content)
    print(f"Patched {PATH}")

if __name__ == "__main__":
    main()
