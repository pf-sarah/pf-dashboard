import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 60;

interface ShopifyOrder {
  id: number;
  name: string;
  tags: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token  = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!domain || !token) return NextResponse.json({ error: 'Shopify not configured' }, { status: 500 });

  // The event date range the user selected
  const startDate    = req.nextUrl.searchParams.get('start') ?? '';
  const endDate      = req.nextUrl.searchParams.get('end')   ?? '';
  const currentCount = parseInt(req.nextUrl.searchParams.get('currentCount') ?? '0');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  try {
    // Pull last 3 months of orders to build the curve + cover current range
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const all: ShopifyOrder[] = [];
    let url: string | null =
      `https://${domain}/admin/api/2024-10/orders.json?status=any&limit=250` +
      `&created_at_min=${encodeURIComponent(threeMonthsAgo.toISOString())}` +
      `&fields=id,name,tags,created_at`;

    while (url) {
      const res: Response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const data = await res.json() as { orders: ShopifyOrder[] };
      all.push(...(data.orders ?? []));
      const link: string | null = res.headers.get('link');
      const next: RegExpMatchArray | null = link?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
      url = next ? next[1] : null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // ── STEP 1: Build cumulative curve from settled historical event dates ──────
    // A settled event date = event date is 14+ days ago (full 7-day window closed + buffer)
    // For each settled event date, collect all orders placed within -30 to +7 days of it
    // Then compute what fraction were placed by day 0, 1, 2, ... 7

    // Group all orders by their event date tag
    const byEventDate: Record<string, { placedMs: number }[]> = {};
    for (const order of all) {
      const tags = order.tags.split(',').map((t: string) => t.trim());
      const eventTag = tags.find((t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t));
      if (!eventTag) continue;
      const placedMs = new Date(order.created_at).setHours(0, 0, 0, 0);
      if (!byEventDate[eventTag]) byEventDate[eventTag] = [];
      byEventDate[eventTag].push({ placedMs });
    }

    // For settled dates, compute cumulative % by day (0–7)
    // cumulativeByDay[d] = avg fraction of final total placed by day d after event
    const dayAccum: number[] = Array(8).fill(0); // index 0–7
    let settledDateCount = 0;

    for (const [eventDateStr, orders] of Object.entries(byEventDate)) {
      const eventMs = new Date(eventDateStr + 'T12:00:00').setHours(0, 0, 0, 0);
      const daysAgo = Math.floor((todayMs - eventMs) / 86400000);

      // Only use dates that are fully settled (14+ days ago)
      if (daysAgo < 14) continue;
      // Only use dates with enough signal
      if (orders.length < 2) continue;

      // Filter to orders placed within -30 to +7 days of event date
      const relevant = orders.filter(o => {
        const diff = Math.floor((o.placedMs - eventMs) / 86400000);
        return diff >= -30 && diff <= 7;
      });
      if (relevant.length < 2) continue;

      const finalCount = relevant.length;

      // For each day 0–7, count how many orders placed by that day
      for (let d = 0; d <= 7; d++) {
        const byDay = relevant.filter(o =>
          Math.floor((o.placedMs - eventMs) / 86400000) <= d
        ).length;
        dayAccum[d] += byDay / finalCount;
      }
      settledDateCount++;
    }

    // Average across all settled event dates
    const curve: number[] = dayAccum.map(v =>
      settledDateCount > 0 ? v / settledDateCount : 0
    );

    // ── STEP 2: Compute blended % for the selected date range ─────────────────
    // For each event date in the range, look up how many days ago it was
    // and read that day's cumulative % from the curve.
    // Blend across all dates in range (simple average).

    const rangeDates: string[] = [];
    const cursor = new Date(startDate + 'T12:00:00');
    const rangeEnd = new Date(endDate + 'T12:00:00');
    while (cursor <= rangeEnd) {
      rangeDates.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    let blendedPct = 0;
    for (const dateStr of rangeDates) {
      const eventMs = new Date(dateStr + 'T12:00:00').setHours(0, 0, 0, 0);
      const daysAfter = Math.floor((todayMs - eventMs) / 86400000);
      // Clamp to 0–7; dates in the future get 0, dates 7+ days ago get curve[7]
      const clampedDay = Math.max(0, Math.min(7, daysAfter));
      blendedPct += curve[clampedDay];
    }
    blendedPct = rangeDates.length > 0 ? blendedPct / rangeDates.length : 0;

    // ── STEP 3: Project expected total ────────────────────────────────────────
    let projection: {
      expected: number;
      blendedPct: number;
      stillExpected: number;
      confidence: string;
      curve: number[];
    } | null = null;

    if (currentCount > 0 && blendedPct > 0.05) {
      const expected      = Math.round(currentCount / blendedPct);
      const stillExpected = Math.max(0, expected - currentCount);
      const confidence    = settledDateCount >= 10 ? 'high' : settledDateCount >= 4 ? 'medium' : 'low';
      projection = { expected, blendedPct, stillExpected, confidence, curve };
    }

    return NextResponse.json({
      curve,
      settledDateCount,
      projection,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
