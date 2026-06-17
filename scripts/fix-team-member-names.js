require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes('--apply');

const NAME_FIXES = {
  'celtiastewart1515@gmail.com': 'Celt Stewart',
  'tuckerrachel98@gmail.com': 'Rachel Tucker',
};

async function main() {
  for (const [email, proposedName] of Object.entries(NAME_FIXES)) {
    console.log(`\n=== ${email} ===`);

    const lastNameGuess = proposedName.split(' ').slice(-1)[0];
    const { data: actualsMatches } = await supabase
      .from('team_member_week_actuals')
      .select('member_name')
      .ilike('member_name', `%${lastNameGuess}%`);

    const distinctCasings = [...new Set((actualsMatches ?? []).map(r => r.member_name))];
    console.log('Existing member_name casing(s) in team_member_week_actuals:', distinctCasings);

    if (distinctCasings.length > 1) {
      console.log(`⚠️  Multiple casings found — pick the one matching "${proposedName}" or confirm before applying.`);
    }
    if (distinctCasings.length === 1 && distinctCasings[0] !== proposedName) {
      console.log(`⚠️  Existing actuals use "${distinctCasings[0]}", not "${proposedName}" — using the existing casing instead.`);
    }

    const finalName = distinctCasings.length === 1 ? distinctCasings[0] : proposedName;

    const { data: profile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('clerk_user_id, email, full_name, team_member_name, location, department')
      .eq('email', email)
      .single();

    if (fetchErr || !profile) {
      console.log(`⚠️  No user_profiles row found for ${email}:`, fetchErr?.message);
      continue;
    }

    console.log('Current profile:', {
      full_name: profile.full_name,
      team_member_name: profile.team_member_name,
      location: profile.location,
      department: profile.department,
    });
    console.log(`${APPLY ? '✏️  Updating' : '🔍 Would update'} -> full_name: "${finalName}", team_member_name: "${finalName}"`);

    if (APPLY) {
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({ full_name: finalName, team_member_name: finalName })
        .eq('email', email);

      if (updateErr) {
        console.error('    ❌ Update failed:', updateErr);
      } else {
        console.log('    ✅ Updated.');
      }
    }
  }

  if (!APPLY) {
    console.log('\nDry run only — no changes made. Re-run with --apply to write updates.');
  }
}

main();
