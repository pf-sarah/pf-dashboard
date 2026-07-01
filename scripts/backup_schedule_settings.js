#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: rows, error } = await supabase
    .from('schedule_settings')
    .select('id, key, value, location, updated_by, updated_at');

  if (error) {
    console.error('Failed to fetch schedule_settings:', error);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(__dirname, `schedule_settings_backup_${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Backed up ${rows.length} rows to ${outPath}`);
}

main();
