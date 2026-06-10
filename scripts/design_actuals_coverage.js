const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const r = await sb.from('team_member_week_actuals')
    .select('location, week_of, actual_orders')
    .eq('department', 'design')
    .limit(50000);
  if (r.error) { console.log(r.error); process.exit(1); }
  const byLocWeek = {};
  r.data.forEach(x => {
    const k = `${x.location}|${x.week_of}`;
    byLocWeek[k] = (byLocWeek[k] ?? 0) + (x.actual_orders ?? 0);
  });
  for (const loc of ['Utah', 'Georgia']) {
    const rows = Object.entries(byLocWeek)
      .filter(([k]) => k.startsWith(loc + '|'))
      .map(([k, v]) => ({ week_of: k.split('|')[1], frames: v }))
      .sort((a, b) => a.week_of.localeCompare(b.week_of));
    const total = rows.reduce((s, x) => s + x.frames, 0);
    console.log(`\n${loc} — design actuals: ${rows.length} weeks, ${total} total frames, from ${rows[0]?.week_of} to ${rows[rows.length - 1]?.week_of}`);
    console.table(rows);
  }
})();
