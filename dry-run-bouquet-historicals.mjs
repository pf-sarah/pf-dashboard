/**
 * dry-run-bouquet-historicals.mjs
 *
 * Drop this in your pf-dashboard project root and run:
 *   node dry-run-bouquet-historicals.mjs
 *
 * Reads from:
 *   - order_status_history (Supabase) — finds bouquetReceived orders from last week
 *   - PF Search API — gets preservationUser for each UUID
 *   - uuid_location_cache (Supabase) — gets location per UUID
 *
 * Prints what would have been written to team_member_week_actuals.
 * Does NOT write anything.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Load env vars from .env.local
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

const env = loadEnv();

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PF_API_URL = env.PF_API_URL?.replace(/\/$/, "");
const PF_EMAIL = env.PF_API_EMAIL;
const PF_PASSWORD = env.PF_API_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !PF_API_URL || !PF_EMAIL || !PF_PASSWORD) {
  console.error("❌ Missing env vars. Check .env.local for NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PF_API_URL, PF_API_EMAIL, PF_API_PASSWORD");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Last week: Monday through Sunday
function getLastWeekRange() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayOfWeek = todayUTC.getUTCDay(); // 0=Sun
  const daysToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6;
  const lastMonday = new Date(todayUTC);
  lastMonday.setUTCDate(todayUTC.getUTCDate() - daysToLastMonday);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
    weekOf: lastMonday.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Supabase fetch helper
// Params can include arrays of [key, value] for repeated keys (e.g. two filters on same column)
// ---------------------------------------------------------------------------
async function supabaseFetch(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const val of v) url.searchParams.append(k, val);
    } else {
      url.searchParams.append(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "count=none",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${path} error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// PF API auth
// ---------------------------------------------------------------------------
async function getPFToken() {
  const endpoints = ["/Authentication/Login"];
  for (const ep of endpoints) {
    const url = `${PF_API_URL}${ep}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: PF_EMAIL, password: PF_PASSWORD }),
    });
    console.log(`   Tried ${ep}: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`   Response keys: ${Object.keys(data).join(", ")}`);
      const token = data.jwt ?? data.token ?? data.accessToken ?? data.access_token ?? data.Token ?? data.JWT;
      if (token) { console.log(`   Auth OK, token field found`); return token; }
      console.log(`   200 OK but no token field found in response`);
    }
  }
  throw new Error(`PF auth failed on all endpoints. Check PF_API_URL (${PF_API_URL}) and credentials.`);
}

// ---------------------------------------------------------------------------
// PF Search API — fetch preservationUser for a batch of UUIDs
// Uses searchTerm ' ' to get all, then filters by uuid
// Batches to avoid giant requests
// ---------------------------------------------------------------------------
async function fetchPreservationUsers(orderNums, token) {
  // Search by each order number individually to get preservationUser
  // Returns map of orderNum -> staffName
  const result = {};
  const total = orderNums.length;
  let done = 0;

  console.log(`  Looking up ${total} order numbers via PF Search API...`);

  // Batch in groups of 10 concurrent requests to avoid hammering the API
  const CONCURRENCY = 5;
  for (let i = 0; i < orderNums.length; i += CONCURRENCY) {
    const batch = orderNums.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (orderNum) => {
      try {
        const res = await fetch(`${PF_API_URL}/OrderProducts/Search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ searchTerm: orderNum, pageSize: 50, pageNumber: 1 }),
        });
        if (!res.ok) {
          result[orderNum] = null;
          return;
        }
        const data = await res.json();
        const items = data.items || [];
        // Find item matching this order number
        const match = items.find(item =>
          String(item.shopifyOrderNumber) === String(orderNum)
        );
        if (match) {
          const fn = match.preservationUserFirstName || "";
          const ln = match.preservationUserLastName || "";
          const name = [fn, ln].filter(Boolean).join(" ").trim();
          result[orderNum] = name || null;
        } else {
          result[orderNum] = null;
        }
      } catch {
        result[orderNum] = null;
      }
      done++;
    }));
    if ((i + CONCURRENCY) % 50 === 0 || i + CONCURRENCY >= orderNums.length) {
      process.stdout.write(`\r  Progress: ${Math.min(done, total)}/${total}`);
    }
  }
  console.log(); // newline after progress
  return result;
}


async function main() {
  const { start, end, weekOf } = getLastWeekRange();
  console.log(`\n🌸 Pressed Floral — Bouquet Delivery Dry Run`);
  console.log(`   Last week: ${start} → ${end} (week_of: ${weekOf})\n`);

  // 1. Sniff schema
  console.log("1. Checking order_status_history schema...");
  const schemaCheck = await supabaseFetch("order_status_history", {
    select: "*",
    limit: "1",
    order: "entered_at.desc",
  });
  if (!schemaCheck.length) { console.log("   order_status_history appears empty."); return; }
  const availableCols = Object.keys(schemaCheck[0]);
  console.log(`   Columns: ${availableCols.join(", ")}\n`);

  const hasUuid = availableCols.includes("uuid");
  const hasOPK = availableCols.includes("order_product_key");
  const idCol = hasUuid ? "uuid" : hasOPK ? "order_product_key" : null;
  const wantedCols = ["order_num", "status", "location", "entered_at", "variant_title"];
  if (idCol) wantedCols.unshift(idCol);
  const selectCols = wantedCols.filter(c => availableCols.includes(c)).join(",");

  // 2. Fetch bouquetReceived rows for last week
  console.log("2. Querying order_status_history for bouquetReceived last week...");
  const rows = await supabaseFetch("order_status_history", {
    select: selectCols,
    status: "eq.bouquetReceived",
    entered_at: [`gte.${start}T00:00:00Z`, `lte.${end}T23:59:59Z`],
    order: "entered_at.asc",
  });

  if (!rows.length) {
    console.log("   No bouquetReceived rows found for last week. Checking recent rows...");
    const sample = await supabaseFetch("order_status_history", {
      select: selectCols, status: "eq.bouquetReceived", limit: "5", order: "entered_at.desc",
    });
    if (sample.length) {
      console.log(`   Most recent bouquetReceived: ${sample[0].entered_at}`);
      console.log("   Sample:", JSON.stringify(sample.slice(0, 2), null, 2));
    } else {
      console.log("   No bouquetReceived rows exist at all.");
    }
    return;
  }
  console.log(`   Found ${rows.length} bouquetReceived rows\n`);

  const byUuid = {};
  for (const row of rows) {
    const key = idCol ? row[idCol] : row.order_num;
    if (!key) continue;
    if (!byUuid[key] || row.entered_at < byUuid[key].entered_at) byUuid[key] = row;
  }
  const uniqueUuids = Object.keys(byUuid);
  console.log(`   Unique ${idCol || "order_num"} entries (deduped): ${uniqueUuids.length}\n`);

  // 3. Get location — try uuid_location_cache first, fall back to order_status_history location col
  // 3. Parse uuid out of order_product_key (format: "orderNum|uuid"), look up uuid_location_cache
  console.log("3. Looking up location + staff_name from uuid_location_cache...");

  // order_product_key = "shopifyOrderNum|uuid"
  const uuidsFromKeys = [];
  const keyToUuid = {};
  for (const key of uniqueUuids) {
    const parts = key.split("|");
    const uuid = parts.length >= 2 ? parts[parts.length - 1] : null;
    if (uuid) { uuidsFromKeys.push(uuid); keyToUuid[key] = uuid; }
  }
  console.log(`   Parsed ${uuidsFromKeys.length} UUIDs from order_product_key`);

  const locationByUuid = {};
  const staffByUuid = {};  // keyed by order_product_key

  if (uuidsFromKeys.length) {
    // Supabase IN filter has limits — batch in chunks of 100
    const BATCH = 100;
    let totalCacheHits = 0;
    for (let i = 0; i < uuidsFromKeys.length; i += BATCH) {
      const batch = uuidsFromKeys.slice(i, i + BATCH);
      const cacheRows = await supabaseFetch("uuid_location_cache", {
        select: "uuid,location,staff_name",
        uuid: `in.(${batch.join(",")})`,
      });
      for (const r of cacheRows) {
        // find the order_product_key that maps to this uuid
        for (const [key, uuid] of Object.entries(keyToUuid)) {
          if (uuid === r.uuid) {
            if (r.location) locationByUuid[key] = r.location;
            if (r.staff_name) staffByUuid[key] = r.staff_name;
          }
        }
        totalCacheHits++;
      }
    }
    console.log(`   uuid_location_cache hits: ${totalCacheHits}`);
  }

  // Fallback: use location col from order_status_history for anything still missing
  for (const [key, row] of Object.entries(byUuid)) {
    if (!locationByUuid[key] && row.location) locationByUuid[key] = row.location;
  }

  const stillMissingLoc = uniqueUuids.filter(k => !locationByUuid[k]);
  const stillMissingStaff = uniqueUuids.filter(k => !staffByUuid[k]);
  console.log(`   Locations resolved: ${uniqueUuids.length - stillMissingLoc.length} | missing: ${stillMissingLoc.length}`);
  console.log(`   Staff resolved: ${uniqueUuids.length - stillMissingStaff.length} | missing: ${stillMissingStaff.length}\n`);

  // 4. Fetch preservationUser from PF Search API by order number
  console.log("4. Fetching preservationUser from PF Search API by order number...");
  const token = await getPFToken();
  console.log(`   Auth OK\n`);

  // Get unique order numbers from our bouquetReceived rows
  const uniqueOrderNums = [...new Set(uniqueUuids.map(k => byUuid[k].order_num).filter(Boolean))];
  console.log(`   Unique order numbers to look up: ${uniqueOrderNums.length}`);
  const puByOrderNum = await fetchPreservationUsers(uniqueOrderNums, token);

  // Map back: order_product_key -> preservationUser (via order_num)
  const preservationUsers = {};
  for (const key of uniqueUuids) {
    const orderNum = byUuid[key].order_num;
    preservationUsers[key] = orderNum ? (puByOrderNum[orderNum] || null) : null;
  }

  const withUser = Object.values(preservationUsers).filter(Boolean).length;
  const withoutUser = uniqueUuids.length - withUser;
  console.log(`\n   preservationUser found: ${withUser} | missing: ${withoutUser}\n`);

    // 5. Build the "what would be written" summary
  console.log("5. Building historicals summary...\n");

  const summary = {}; // key: `location|staffName|weekOf`
  const detailRows = [];

  for (const key of uniqueUuids) {
    const row = byUuid[key];
    // location: prefer uuid_location_cache hit, fall back to order_status_history location col
    const location = locationByUuid[key] || locationByUuid[row.order_num] || row.location || "Unknown";
    const staffName = preservationUsers[key] || null;
    const receivedDate = row.entered_at.slice(0, 10);

    detailRows.push({
      id: key,
      order_num: row.order_num,
      received_date: receivedDate,
      location,
      staff_name: staffName || "(no preservationUser)",
      variant_title: row.variant_title || "",
    });

    if (staffName) {
      const summaryKey = `${location}|${staffName}|${weekOf}`;
      summary[summaryKey] = (summary[summaryKey] || 0) + 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Print detail table
  // ---------------------------------------------------------------------------
  console.log("━".repeat(90));
  console.log("DETAIL — All bouquetReceived orders last week");
  console.log("━".repeat(90));
  console.log(
    "Order #".padEnd(14) +
    "Received".padEnd(13) +
    "Location".padEnd(12) +
    "Staff (preservationUser)".padEnd(30) +
    "UUID"
  );
  console.log("─".repeat(90));

  // Sort by location then staff then date
  detailRows.sort((a, b) =>
    `${a.location}${a.staff_name}${a.received_date}`.localeCompare(
      `${b.location}${b.staff_name}${b.received_date}`
    )
  );

  for (const r of detailRows) {
    console.log(
      r.order_num.padEnd(14) +
      r.received_date.padEnd(13) +
      r.location.padEnd(12) +
      r.staff_name.padEnd(30) +
      (r.id || r.order_num || "").slice(0, 12)
    );
  }

  // ---------------------------------------------------------------------------
  // Print summary (what would be written to team_member_week_actuals)
  // ---------------------------------------------------------------------------
  console.log("\n" + "━".repeat(70));
  console.log("SUMMARY — What would be written to team_member_week_actuals");
  console.log(`week_of: ${weekOf}  |  dept: Preservation`);
  console.log("━".repeat(70));
  console.log(
    "Location".padEnd(12) +
    "Staff Name".padEnd(30) +
    "Orders (bouquets received)"
  );
  console.log("─".repeat(70));

  const summaryEntries = Object.entries(summary).sort(([a], [b]) => a.localeCompare(b));
  let grandTotal = 0;
  for (const [key, count] of summaryEntries) {
    const [location, staffName] = key.split("|");
    console.log(location.padEnd(12) + staffName.padEnd(30) + count);
    grandTotal += count;
  }
  console.log("─".repeat(70));
  console.log("TOTAL".padEnd(42) + grandTotal);

  // ---------------------------------------------------------------------------
  // Orders with no preservationUser
  // ---------------------------------------------------------------------------
  const unassigned = detailRows.filter((r) => r.staff_name === "(no preservationUser)");
  if (unassigned.length) {
    console.log(`\n⚠  ${unassigned.length} orders had no preservationUser — not included in summary above:`);
    for (const r of unassigned) {
      console.log(`   ${r.order_num} | ${r.received_date} | ${r.location} | id: ${(r.id || r.order_num || "").slice(0, 12)}`);
    }
  }

  console.log("\n✅ Dry run complete — nothing was written to the database.\n");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
