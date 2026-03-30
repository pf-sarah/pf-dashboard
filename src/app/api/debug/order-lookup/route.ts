import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const num = req.nextUrl.searchParams.get('order') ?? '43515';

  const [pfData, { data: supabaseRows }] = await Promise.all([
    pfPost<unknown>('/OrderProducts/Search', {
      searchTerm: num,
      pageNumber: 1,
      pageSize: 10,
    }).catch(e => ({ error: String(e) })),
    supabase
      .from('order_status_history')
      .select('*')
      .eq('order_num', num)
      .order('first_seen_at', { ascending: false }),
  ]);

  // Try to find the order product UUID from the search result
  const items = (pfData as { items?: { uuid?: string; orderUuid?: string }[] })?.items;
  const uuid = items?.[0]?.uuid;
  const orderUuid = items?.[0]?.orderUuid;

  // Probe additional endpoints using the UUID to find status history
  const probes: Record<string, unknown> = {};
  if (uuid) {
    // These returned 405 (Method Not Allowed) on GET — try POST
    const postEndpoints = [
      `/OrderProducts/${uuid}/StatusHistory`,
      `/OrderProducts/${uuid}/History`,
      `/OrderProducts/${uuid}/Audit`,
    ];
    await Promise.all(postEndpoints.map(async path => {
      probes[`POST ${path}`] = await pfPost<unknown>(path, {}).catch(e => ({ error: String(e) }));
    }));
    // Also try with orderProductUuid in body
    probes[`POST /OrderProducts/StatusHistory (body)`] = await pfPost<unknown>('/OrderProducts/StatusHistory', { orderProductUuid: uuid }).catch(e => ({ error: String(e) }));
    probes[`POST /OrderProducts/History (body)`] = await pfPost<unknown>('/OrderProducts/History', { orderProductUuid: uuid }).catch(e => ({ error: String(e) }));
  }
  if (orderUuid) {
    probes[`GET /Orders/${orderUuid}`] = await pfGet<unknown>(`/Orders/${orderUuid}`).catch(e => ({ error: String(e) }));
    probes[`POST /Orders/${orderUuid}/StatusHistory`] = await pfPost<unknown>(`/Orders/${orderUuid}/StatusHistory`, {}).catch(e => ({ error: String(e) }));
  }

  // Also find a preservation-status order to debug staff assignment
  const presDebug = await pfPost<{items: unknown[]}>('/OrderProducts/Search', {
    searchTerm: '',
    status: 'bouquetReceived',
    pageNumber: 1,
    pageSize: 3,
  }).catch(() => null);

  // Test: does WeeklyReport filter by status-change date or order date?
  // If #43515 appears here, WeeklyReport uses status-change date (what we want!)
  const today = new Date().toISOString().split('T')[0];
  const weeklyToday = await pfGet<unknown>(
    `/OrderProducts/WeeklyReport?startDate=${today}&endDate=${today}`
  ).catch(e => ({ error: String(e) }));
  const weeklyTodayHits = Array.isArray(weeklyToday)
    ? weeklyToday.filter((i: { shopifyOrderNumber?: unknown; orderNumber?: unknown }) =>
        String(i.shopifyOrderNumber ?? i.orderNumber ?? '') === num
      )
    : weeklyToday;

  return NextResponse.json({ order: num, pfData, supabaseRows, probes, weeklyToday: weeklyTodayHits, presDebug: presDebug?.items?.slice(0, 3) });
}
