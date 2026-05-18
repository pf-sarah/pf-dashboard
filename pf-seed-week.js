require('dotenv').config({ path: '.env.local' });

const PF_BASE = process.env.PF_API_URL.endsWith('/') ? process.env.PF_API_URL : process.env.PF_API_URL + '/';
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WEEK_START = '2026-04-27';
const WEEK_END   = '2026-05-03';

function toMondayWeek(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().split('T')[0];
}

async function main() {
  const authRes = await fetch(PF_BASE + 'Authentication/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PF_API_EMAIL, password: process.env.PF_API_PASSWORD })
  });
  const authJson = await authRes.json();
  const token = authJson.jwt ?? authJson.token ?? authJson.accessToken ?? authJson.access_token;
  console.log('Auth OK');

  // Get all order_nums from uuid_location_cache that are approved or disapproved
  const sbRes = await fetch(
    SB_URL + '/rest/v1/uuid_location_cache?select=order_num,status&or=(status.eq.approved,status.eq.disapproved)&limit=5000',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
  );
  const cacheRows = await sbRes.json();

  // Also get from order_status_history
  const histRes = await fetch(
    SB_URL + '/rest/v1/order_status_history?select=order_num,status&or=(status.eq.approved,status.eq.disapproved)&limit=5000',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
  );
  const histRows = await histRes.json();

  const allRows = [...cacheRows, ...histRows];
  const orderNums = [...new Set(allRows.map(r => r.order_num))];
  const currentlyDisapproved = new Set(allRows.filter(r => r.status === 'disapproved').map(r => r.order_num));
  console.log('Total orders to check:', orderNums.length);

  const events = [];
  let processed = 0;
  const now = new Date().toISOString();

  for (const orderNum of orderNums) {
    try {
      const searchRes = await fetch(PF_BASE + 'OrderProducts/Search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ search: orderNum, searchTerm: orderNum, pageSize: 10, pageNumber: 1 })
      });
      const searchData = await searchRes.json();
      const items = (searchData.items ?? []).filter(i => i.shopifyOrderNumber === orderNum);

      for (const item of items) {
        const detailRes = await fetch(PF_BASE + 'OrderProducts/Details/' + item.uuid, {
          headers: { Authorization: 'Bearer ' + token }
        });
        const detail = await detailRes.json();

        for (const entry of (detail.history ?? [])) {
          if (entry.status !== 'approved' && entry.status !== 'disapproved') continue;
          
          // Only keep events in our target week
          const entryDate = entry.dateCreated.slice(0, 10);
          if (entryDate < WEEK_START || entryDate > WEEK_END) continue;

          const firstName = entry.assignedToUserFirstName ?? detail.assignedToUserFirstName;
          const lastName  = entry.assignedToUserLastName  ?? detail.assignedToUserLastName;
          if (!firstName && !lastName) continue;
          const name   = `${firstName ?? ''} ${lastName ?? ''}`.trim();
          const weekOf = toMondayWeek(entry.dateCreated);
          const comment = entry.status === 'disapproved' && currentlyDisapproved.has(orderNum)
            ? (detail.comment ?? null) : null;

          events.push({
            uuid: detail.uuid, order_num: orderNum, designer_name: name,
            location: detail.location ?? null,
            event_type: entry.status, event_date: entry.dateCreated,
            week_of: weekOf, comment, synced_at: now
          });
        }
      }
      processed++;
    } catch(e) {}

    if (processed % 50 === 0) console.log(`  ${processed}/${orderNums.length} processed, ${events.length} events in week so far...`);
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`Done. ${processed} orders checked, ${events.length} events found for week of ${WEEK_START}.`);
  if (events.length === 0) { console.log('No events found — week may already be seeded or no activity.'); return; }

    // Delete existing rows for this week then insert fresh
  const delRes = await fetch(
    SB_URL + '/rest/v1/designer_approval_events?week_of=eq.' + WEEK_START,
    { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
  );
  console.log('Delete HTTP:', delRes.status);
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    const res = await fetch(SB_URL + '/rest/v1/designer_approval_events', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(chunk)
    });
    console.log('Insert chunk', i, 'HTTP:', res.status);
  }
  // Show summary
  const byDesigner = {};
  events.forEach(e => {
    if (!byDesigner[e.designer_name]) byDesigner[e.designer_name] = {a:0,d:0};
    byDesigner[e.designer_name][e.event_type === 'approved' ? 'a' : 'd']++;
  });
  console.log('\nSummary for week of', WEEK_START);
  Object.entries(byDesigner).sort().forEach(([name, c]) => {
    const rate = c.a > 0 ? Math.round(c.d/c.a*100)+'%' : 'n/a';
    console.log(`  ${name.padEnd(25)} ${c.d}↓ / ${c.a}✓  ${rate}`);
  });
}
main().catch(console.error);
