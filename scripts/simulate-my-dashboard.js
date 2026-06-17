require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/simulate-my-dashboard.js someone@email.com');
  process.exit(1);
}

function getMondayOfWeek(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7;
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

async function main() {
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (profileErr || !profile) {
    console.log(`No user_profiles row for ${email}:`, profileErr?.message);
    return;
  }

  console.log('--- profile ---');
  console.log(profile);

  let memberName = profile.team_member_name;
  let location = profile.location;
  let department = profile.department;

  if (!memberName || !location || !department) {
    console.log('\n⚠️  Missing memberName/location/department on profile — this alone would produce a blank dashboard.');
    return;
  }

  const { data: emp } = await supabase
    .from('rippling_employees')
    .select('department, location')
    .ilike('full_name', memberName.trim())
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (emp?.department) department = emp.department.toLowerCase();
  if (emp?.location) location = emp.location;

  console.log('\n--- resolved identity ---');
  console.log({ memberName, location, department });

  const since = new Date();
  since.setDate(since.getDate() - 26 * 7);
  const sinceIso = since.toISOString().split('T')[0];

  const { data: actuals } = await supabase
    .from('team_member_week_actuals')
    .select('week_of, actual_hours, actual_orders, department')
    .eq('location', location)
    .eq('member_name', memberName)
    .gte('week_of', sinceIso)
    .order('week_of', { ascending: false });

  console.log(`\n--- team_member_week_actuals matches: ${(actuals ?? []).length} rows ---`);

  const ROSTER_KEYS = {
    design: 'designRoster',
    preservation: 'presRoster',
    fulfillment: 'ffRoster',
    resin: 'resinRoster',
  };
  const homeDeptNorm = department?.toLowerCase() ?? '';
  const homeRosterKey = ROSTER_KEYS[homeDeptNorm] ?? null;

  if (!homeRosterKey) {
    console.log(`\n⚠️  No roster key for department "${department}" — check spelling/casing.`);
    return;
  }

  const { data: rosterRow } = await supabase
    .from('schedule_settings')
    .select('value')
    .eq('location', location)
    .eq('key', homeRosterKey)
    .maybeSingle();

  const roster = rosterRow ? (typeof rosterRow.value === 'string' ? JSON.parse(rosterRow.value) : rosterRow.value) : {};
  const nameLower = memberName.trim().toLowerCase();
  const match = Object.entries(roster).find(([key, m]) => !m?._removed && m?.name?.trim().toLowerCase() === nameLower);

  console.log(`\n--- ${homeRosterKey} (${location}) lookup ---`);
  if (!match) {
    console.log(`⚠️  "${memberName}" NOT FOUND in ${homeRosterKey}. This is why scheduled hours/ratio are blank.`);
    console.log('Names currently in that roster:', Object.values(roster).filter(m => !m?._removed).map(m => m?.name));
  } else {
    console.log(`✅ Found as id "${match[0]}" with ratio ${match[1]?.ratio}`);
  }
}

main();
