#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KEYS_TO_MIGRATE = ['designDailyHours', 'ffDailyHours', 'presDailyHours', 'presCheckHours'];

function rekeyToWeekZero(obj) {
  if (!obj || typeof obj !== 'object') return { obj, skipped: false };
  const keys = Object.keys(obj);
  const alreadyMigrated = keys.length > 0 && keys.every(k => /^\d+-/.test(k));
  if (alreadyMigrated) return { obj, skipped: true };

  const migrated = {};
  for (const [memberId, value] of Object.entries(obj)) {
    migrated[`0-${memberId}`] = value;
  }
  return { obj: migrated, skipped: false };
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
    if (!KEYS_TO_MIGRATE.includes(row.key)) continue;

    const memberCount = Object.keys(row.value || {}).length;
    if (memberCount === 0) {
      console.log(`SKIP  [${row.location}] ${row.key} — empty, nothing to migrate`);
      continue;
    }

    const { obj: migrated, skipped } = rekeyToWeekZero(row.value);

    if (skipped) {
      console.log(`SKIP  [${row.location}] ${row.key} — already migrated`);
      continue;
    }

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} [${row.location}] ${row.key} — re-keying ${memberCount} member(s) to week 0`);
    console.log(`        before: ${Object.keys(row.value).slice(0, 3).join(', ')}${memberCount > 3 ? ', ...' : ''}`);
    console.log(`        after:  ${Object.keys(migrated).slice(0, 3).join(', ')}${memberCount > 3 ? ', ...' : ''}`);

    totalChanges++;

    if (APPLY) {
      const { error: updateError } = await supabase
        .from('schedule_settings')
        .update({ value: migrated })
        .eq('id', row.id);

      if (updateError) {
        console.error(`  ❌ Failed to update [${row.location}] ${row.key}:`, updateError);
      } else {
        console.log(`  ✅ Updated`);
      }
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would apply'} ${totalChanges} row migration(s).`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main();
