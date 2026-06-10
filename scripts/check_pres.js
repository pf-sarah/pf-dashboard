const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const pres = await sb.from('preservation_week_actuals').select('*').gte('week_of', '2026-02-01').order('week_of');
  console.log('preservation_week_actuals rows since Feb:');
  console.table(pres.data);
  if (pres.error) console.log(pres.error);
  const sample = await sb.from('team_member_week_actuals').select('*').eq('department', 'preservation').limit(2);
  console.log('team_member_week_actuals sample (to confirm columns):');
  console.table(sample.data);
  if (sample.error) console.log(sample.error);
})();
