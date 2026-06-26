require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('schedule_settings')
    .select('key, location, updated_at')
    .in('key', ['designHours', 'presHours', 'ffHours', 'resinHours'])
    .order('location')
    .order('key');

  if (error) {
    console.log('Error (maybe no updated_at column?):', error.message);
    return;
  }

  const now = new Date();
  for (const row of data ?? []) {
    const updated = new Date(row.updated_at);
    const weeksAgo = Math.floor((now - updated) / (7 * 24 * 60 * 60 * 1000));
    console.log(`${row.location.padEnd(8)} ${row.key.padEnd(12)} last updated ${weeksAgo} week(s) ago (${row.updated_at})`);
  }
}

main();
