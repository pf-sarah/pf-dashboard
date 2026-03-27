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
    const endpoints = [
      `/OrderProducts/${uuid}`,
      `/OrderProducts/${uuid}/StatusHistory`,
      `/OrderProducts/${uuid}/History`,
      `/OrderProducts/${uuid}/Audit`,
    ];
    await Promise.all(endpoints.map(async path => {
      probes[path] = await pfGet<unknown>(path).catch(e => ({ error: String(e) }));
    }));
  }
  if (orderUuid) {
    probes[`/Orders/${orderUuid}`] = await pfGet<unknown>(`/Orders/${orderUuid}`).catch(e => ({ error: String(e) }));
  }

  return NextResponse.json({ order: num, pfData, supabaseRows, probes });
}
