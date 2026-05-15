require('dotenv').config({ path: '.env.local' });

async function main() {
  const base = process.env.PF_API_URL.endsWith('/') ? process.env.PF_API_URL : process.env.PF_API_URL + '/';

  const authRes = await fetch(base + 'Authentication/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PF_API_EMAIL, password: process.env.PF_API_PASSWORD })
  });
  const authJson = await authRes.json();
  const token = authJson.jwt ?? authJson.token ?? authJson.accessToken ?? authJson.access_token;

  // Get all approved/disapproved order_nums from Supabase
  const sbRes = await fetch(
    process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/order_status_history?select=order_num,status&or=(status.eq.approved,status.eq.disapproved)&limit=1000',
    { headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    }}
  );
  const rows = await sbRes.json();
  const orderNums = [...new Set(rows.map(r => r.order_num))];
  console.log('Total unique orders to check:', orderNums.length);

  // Monday-anchored week helper
  function toMondayWeek(dateStr) {
    const d = new Date(dateStr);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    return mon.toISOString().split('T')[0];
  }

  // Last week's Monday
  const now = new Date();
  const todayDay = now.getUTCDay();
  const daysToLastMonday = todayDay === 0 ? 13 : todayDay + 6;
  const lastMonday = new Date(now);
  lastMonday.setUTCDate(now.getUTCDate() - daysToLastMonday);
  const lastMondayIso = lastMonday.toISOString().split('T')[0];
  console.log('Last week (Monday):', lastMondayIso);

  // Per-designer counts for last week
  const byDesigner = {};

  let processed = 0;
  for (const orderNum of orderNums) {
    try {
      const searchRes = await fetch(base + 'OrderProducts/Search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ search: orderNum, searchTerm: orderNum, pageSize: 10, pageNumber: 1 })
      });
      const searchData = await searchRes.json();
      const items = (searchData.items ?? []).filter(i => i.shopifyOrderNumber === orderNum);

      for (const item of items) {
        const detailRes = await fetch(base + 'OrderProducts/Details/' + item.uuid, {
          headers: { Authorization: 'Bearer ' + token }
        });
        const detail = await detailRes.json();

        for (const entry of (detail.history ?? [])) {
          if (entry.status !== 'approved' && entry.status !== 'disapproved') continue;
          const weekOf = toMondayWeek(entry.dateCreated);
          if (weekOf !== lastMondayIso) continue;

          const firstName = entry.assignedToUserFirstName ?? detail.assignedToUserFirstName;
          const lastName  = entry.assignedToUserLastName  ?? detail.assignedToUserLastName;
          if (!firstName && !lastName) continue;
          const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();

          if (!byDesigner[name]) byDesigner[name] = { approved: 0, disapproved: 0 };
          byDesigner[name][entry.status]++;
        }
      }
      processed++;
    } catch(e) {
      // skip
    }
    await new Promise(r => setTimeout(r, 50));
  }

  console.log('\nDisapproval rates for week of', lastMondayIso, ':');
  console.log('Designer                    | Approved | Disapproved | Rate');
  console.log('-----------------------------------------------------------');
  for (const [name, counts] of Object.entries(byDesigner).sort()) {
    const rate = counts.approved > 0 ? Math.round(counts.disapproved / counts.approved * 100) + '%' : 'n/a';
    console.log(`${name.padEnd(28)}| ${String(counts.approved).padEnd(9)}| ${String(counts.disapproved).padEnd(12)}| ${rate}`);
  }
  console.log('\nProcessed', processed, 'orders.');
}
main().catch(console.error);
