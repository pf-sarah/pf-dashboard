import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet, pfPost } from '@/lib/pf-api';

export const maxDuration = 120;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status   = 'readyToFrame';
  const location = 'Utah';
  const results: Record<string, unknown> = {};

  // Probe 1: POST Search with status in body (various param names)
  const bodies = [
    { searchTerm: ' ', status, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', status, location, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', orderStatus: status, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', statusFilter: status, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', currentStatus: status, pageNumber: 1, pageSize: 3 },
  ];
  results['probe1_postSearch'] = {};
  for (const body of bodies) {
    try {
      const data = await pfPost<{ items: { shopifyOrderNumber?: number; status?: string }[]; totalItems?: number }>(
        '/OrderProducts/Search', body
      );
      const key = JSON.stringify(body).substring(0, 80);
      const sample = data.items?.[0];
      (results['probe1_postSearch'] as Record<string, unknown>)[key] = {
        total: data.totalItems ?? data.items?.length,
        sampleStatus: sample?.status,
        sampleOrder: sample?.shopifyOrderNumber,
      };
    } catch (e) {
      (results['probe1_postSearch'] as Record<string, unknown>)[JSON.stringify(body).substring(0, 60)] = { error: String(e) };
    }
  }

  // Probe 2: GET with query params
  const getPaths = [
    `/OrderProducts?status=${status}&location=${location}&pageNumber=1&pageSize=3`,
    `/OrderProducts?status=${status}&pageNumber=1&pageSize=3`,
    `/OrderProducts/ByStatus?status=${status}&location=${location}&pageNumber=1&pageSize=3`,
    `/OrderProducts/List?status=${status}&location=${location}&pageNumber=1&pageSize=3`,
    `/OrderProducts/Search?status=${status}&location=${location}&pageNumber=1&pageSize=3`,
  ];
  results['probe2_getWithParams'] = {};
  for (const path of getPaths) {
    try {
      const data = await pfGet<unknown>(path);
      const items = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? [];
      (results['probe2_getWithParams'] as Record<string, unknown>)[path] = {
        count: items.length,
        sample: items[0],
      };
    } catch (e) {
      (results['probe2_getWithParams'] as Record<string, unknown>)[path] = { error: String(e) };
    }
  }

  // Probe 3: Check what fields come back on a readyToFrame order from WeeklyReport
  // WeeklyReport returns orders with status — pick one with readyToFrame status
  try {
    const today = new Date();
    const mon   = new Date(today); mon.setDate(today.getDate() - 60); // 60 days back
    const sun   = new Date(today);
    const fmt   = (d: Date) => d.toISOString().split('T')[0];
    const wr = await pfGet<{ status?: string; orderNumber?: number; shopifyOrderNumber?: number }[]>(
      `/OrderProducts/WeeklyReport?startDate=${fmt(mon)}&endDate=${fmt(sun)}`
    );
    const readyOrders = (wr ?? []).filter(i => i.status === status).slice(0, 5);
    results['probe3_weeklyReportSample'] = {
      readyToFrameCount: (wr ?? []).filter(i => i.status === status).length,
      sample: readyOrders,
      allStatuses: [...new Set((wr ?? []).map(i => i.status))],
    };
  } catch (e) {
    results['probe3_weeklyReportSample'] = { error: String(e) };
  }

  return NextResponse.json(results);
}
