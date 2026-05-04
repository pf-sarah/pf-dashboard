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

  const currentCount   = parseInt(req.nextUrl.searchParams.get('currentCount') ?? '0');
  const eventWeekStart = req.nextUrl.searchParams.get('eventWeekStart') ?? '';

  try {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const all: ShopifyOrder[] = [];
    let url: string | null =
      `https://${domain}/admin/api/2024-10/orders.json?status=any&limit=250` +
      `&created_at_min=${encodeURIComponent(twoMonthsAgo.toISOString())}` +
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

    // Group orders by event-week Monday
    const weekMap: Record<string, ShopifyOrder[]> = {};
    for (const order of all) {
      const tags = order.tags.split(',').map(t => t.trim());
      const eventDateTag = tags.find(t => /^\d{4}-\d{2}-\d{2}$/.test(t));
      if (!eventDateTag) continue;
      const eventDate = new Date(eventDateTag + 'T12:00:00');
      const dow = eventDate.getDay();
      const daysToMon = dow === 0 ? -6 : 1 - dow;
      const weekMon = new Date(eventDate);
      weekMon.setDate(eventDate.getDate() + daysToMon);
      const weekKey = weekMon.toISOString().split('T')[0];
      if (!weekMap[weekKey]) weekMap[weekKey] = [];
      weekMap[weekKey].push(order);
    }

    // Compute avg fraction of final orders placed by Mon / Tue / Wed
    // using only complete past weeks with enough signal
    const stats = { mon: 0, tue: 0, wed: 0, total: 0, weekCount: 0 };

    for (const [weekKey, orders] of Object.entries(weekMap)) {
      const weekMon = new Date(weekKey + 'T12:00:00');
      const weekSun = new Date(weekMon);
      weekSun.setDate(weekMon.getDate() + 6);
      weekSun.setHours(23, 59, 59);
      if (weekSun >= today) continue;  // skip incomplete weeks
      if (orders.length < 3) continue; // skip noise

      const finalCount  = orders.length;
      const weekMonMs   = weekMon.getTime();
      let byMon = 0, byTue = 0, byWed = 0;

      for (const order of orders) {
        const placed = new Date(order.created_at);
        placed.setHours(0, 0, 0, 0);
        const daysIntoWeek = Math.floor((placed.getTime() - weekMonMs) / 86400000);
        if (daysIntoWeek <= 0) byMon++;
        if (daysIntoWeek <= 1) byTue++;
        if (daysIntoWeek <= 2) byWed++;
      }

      stats.mon       += byMon / finalCount;
      stats.tue       += byTue / finalCount;
      stats.total     += finalCount;
      stats.weekCount++;
      // byTue and byWed accumulate separately
      stats.tue += 0; // already counted above — reset handled below
      stats.wed += byWed / finalCount;
    }

    const wc = stats.weekCount || 1;
    const multipliers = {
      byMonday:       stats.mon / wc,
      byTuesday:      stats.tue / wc,
      byWednesday:    stats.wed / wc,
      weeksAnalyzed:  stats.weekCount,
      avgWeeklyTotal: stats.weekCount > 0 ? Math.round(stats.total / stats.weekCount) : 0,
    };

    let projection: {
      expected: number; confidence: string; multiplierUsed: number; dayOfWeek: string
    } | null = null;

    if (currentCount > 0 && eventWeekStart) {
      const eventMon     = new Date(eventWeekStart + 'T12:00:00');
      const daysIntoWeek = Math.floor((today.getTime() - eventMon.getTime()) / 86400000);
      let multiplierUsed = multipliers.byMonday;
      let dayOfWeek      = 'Monday';
      if (daysIntoWeek <= 0)      { multiplierUsed = multipliers.byMonday;    dayOfWeek = 'Monday'; }
      else if (daysIntoWeek <= 1) { multiplierUsed = multipliers.byTuesday;   dayOfWeek = 'Tuesday'; }
      else if (daysIntoWeek <= 2) { multiplierUsed = multipliers.byWednesday; dayOfWeek = 'Wednesday'; }
      else                        { multiplierUsed = 0.95;                     dayOfWeek = 'Thursday+'; }

      const expected   = multiplierUsed > 0.05 ? Math.round(currentCount / multiplierUsed) : currentCount;
      const confidence = stats.weekCount >= 6 ? 'high' : stats.weekCount >= 3 ? 'medium' : 'low';
      projection = { expected, confidence, multiplierUsed, dayOfWeek };
    }

    return NextResponse.json({ multipliers, projection, weeksAnalyzed: stats.weekCount });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
