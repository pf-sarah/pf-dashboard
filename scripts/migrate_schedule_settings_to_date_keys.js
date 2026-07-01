#!/usr/bin/env node
// One-time migration: convert schedule_settings week-offset-indexed storage to
// date-keyed storage, fixing the "week index 0 silently drifts to a new
// calendar date every week" bug. See src/lib/weekDates.ts for the canonical
// (must-stay-in-sync) implementation of the date math used here.
//
// Usage:
//   node scripts/migrate_schedule_settings_to_date_keys.js            (dry run)
//   node scripts/migrate_schedule_settings_to_date_keys.js --apply    (writes)

const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const WEEKS = 52;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Canonical date math (verbatim copy of src/lib/weekDates.ts) ────────────────
function getMondayDate(offsetWeeks) {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoMonday(offsetWeeks) {
  return getMondayDate(offsetWeeks).toISOString().split('T')[0];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
// Composite daily key must start with a full "YYYY-MM-DD-" date, not just digits.
function isDateKeyedComposite(key) {
  return /^\d{4}-\d{2}-\d{2}-/.test(key);
}

// ── Key categories ──────────────────────────────────────────────────────────
const WEEKLY_KEYS = ['designHours', 'presHours', 'ffHours', 'mgrTotalHours'];
const DAILY_KEYS  = ['designDailyHours', 'presDailyHours', 'presCheckHours', 'ffDailyHours', 'resinDailyHours'];
const RESIN_HOURS_KEY = 'resinHours';
const DROP_KEYS = ['flexRows'];

function migrateWeekly(value) {
  const keys = Object.keys(value || {});
  const alreadyMigrated = keys.length > 0 && keys.every(memberId => {
    const inner = value[memberId];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return false;
    const innerKeys = Object.keys(inner);
    return innerKeys.length === 0 || innerKeys.every(k => ISO_DATE_RE.test(k));
  });
  if (alreadyMigrated) return { migrated: value, skipped: true };

  const migrated = {};
  for (const [memberId, arr] of Object.entries(value || {})) {
    if (!Array.isArray(arr)) { migrated[memberId] = arr; continue; }
    const byDate = {};
    arr.forEach((hrs, i) => {
      if (i >= WEEKS) return;
      if (hrs) byDate[isoMonday(i)] = hrs;
    });
    migrated[memberId] = byDate;
  }
  return { migrated, skipped: false };
}

// Per-key, not bulk: safe to re-run even when a row is a mix of already-migrated
// date-keyed entries and untouched legacy entries (numeric-offset or bare-memberId).
function migrateDaily(value) {
  const OFFSET_KEY_RE = /^(\d+)-(.+)$/;
  let changed = false;
  const migrated = {};
  for (const [key, arr] of Object.entries(value || {})) {
    if (isDateKeyedComposite(key)) { migrated[key] = arr; continue; } // already migrated
    const m = key.match(OFFSET_KEY_RE);
    if (!m) { migrated[key] = arr; continue; } // legacy bare key we can't safely interpret — leave alone
    const offset = parseInt(m[1], 10);
    migrated[`${isoMonday(offset)}-${m[2]}`] = arr;
    changed = true;
  }
  return { migrated, skipped: !changed };
}

function migrateResinHours(value) {
  if (!Array.isArray(value)) return { migrated: value, skipped: true }; // already date-keyed object
  const migrated = {};
  value.forEach((weekObj, i) => {
    if (i >= WEEKS || !weekObj || Object.keys(weekObj).length === 0) return;
    migrated[isoMonday(i)] = weekObj;
  });
  return { migrated, skipped: false };
}

async function main() {
  const { data: rows, error } = await supabase
    .from('schedule_settings')
    .select('id, key, value, location');

  if (error) {
    console.error('Failed to fetch schedule_settings:', error);
    process.exit(1);
  }

  let totalChanges = 0;

  for (const row of rows) {
    if (DROP_KEYS.includes(row.key)) {
      console.log(`SKIP  [${row.location}] ${row.key} — dropped key, not migrated`);
      continue;
    }

    let result;
    if (WEEKLY_KEYS.includes(row.key)) {
      result = migrateWeekly(row.value);
    } else if (DAILY_KEYS.includes(row.key)) {
      result = migrateDaily(row.value);
    } else if (row.key === RESIN_HOURS_KEY) {
      result = migrateResinHours(row.value);
    } else {
      continue; // not an in-scope key (e.g. rosters, weeklyEstimates — already date-keyed or unaffected)
    }

    const { migrated, skipped } = result;
    if (skipped) {
      console.log(`SKIP  [${row.location}] ${row.key} — already migrated or empty`);
      continue;
    }

    const beforeKeys = Object.keys(row.value || {});
    const afterKeys  = Object.keys(migrated || {});
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} [${row.location}] ${row.key} — re-keying ${beforeKeys.length} entr${beforeKeys.length === 1 ? 'y' : 'ies'}`);
    console.log(`        before: ${beforeKeys.slice(0, 3).join(', ')}${beforeKeys.length > 3 ? ', ...' : ''}`);
    console.log(`        after:  ${afterKeys.slice(0, 3).join(', ')}${afterKeys.length > 3 ? ', ...' : ''}`);

    totalChanges++;

    if (APPLY) {
      const { error: updateError } = await supabase
        .from('schedule_settings')
        .update({ value: migrated })
        .eq('id', row.id);

      if (updateError) {
        console.error(`  ❌ Failed to update [${row.location}] ${row.key}:`, updateError);
      } else {
        console.log('  ✅ Updated');
      }
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would apply'} ${totalChanges} row migration(s).`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main();
