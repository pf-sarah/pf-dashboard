const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('/Users/sarahferrell/Documents/pf-dashboard/.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data } = await sb.from('schedule_settings').select('key, value').eq('location', 'Utah')
    .in('key', ['resinHours', 'presRoster', 'presHours', 'presDailyHours', 'designHours']);
  const p = {};
  for (const r of data ?? []) p[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;

  console.log('resinHours[0]:', JSON.stringify(p.resinHours?.['0']));
  console.log('resinHours[1]:', JSON.stringify(p.resinHours?.['1']));
  console.log('resinHours[2]:', JSON.stringify(p.resinHours?.['2']));

  console.log('\npresRoster entries:');
  for (const [id, m] of Object.entries(p.presRoster ?? {}))
    console.log('  ', id, '->', JSON.stringify({ name: m?.name, _removed: m?._removed }));

  console.log('\npresHours[ut-p7]:', JSON.stringify(p.presHours?.['ut-p7']));
  console.log('presDailyHours[ut-p7]:', JSON.stringify(p.presDailyHours?.['ut-p7']));

  console.log('\ndesignHours non-zero entries:');
  for (const [id, arr] of Object.entries(p.designHours ?? {}))
    if (Array.isArray(arr) && arr.some(h => h > 0))
      console.log('  ', id, '->', JSON.stringify(arr.slice(0, 10)), '...');

  const { data: profs } = await sb.from('user_profiles').select('team_member_name, location, department, role');
  console.log('\nall user_profiles names:', JSON.stringify((profs ?? []).map(x => x.team_member_name)));
})();
