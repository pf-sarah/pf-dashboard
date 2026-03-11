import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet, fmtDate } from '@/lib/pf-api';

export const maxDuration = 300;

// Designer UUIDs from known orders
const DESIGNERS: Record<string, string> = {
  'Hailey Hill':   '0db48741-892e-47ae-a61a-4ade53449eb6',
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today   = new Date();
  const dow     = today.getDay();
  const lastMon = new Date(today); lastMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
  const start   = fmtDate(lastMon);
  const end     = fmtDate(lastSun);

  const results: Record<string, unknown> = {};

  // ── Probe 1: Search with UUID as searchTerm ───────────────────────────────
  // If UUID appears in any stored field, Search will return it
  results['probe1_uuidAsSearchTerm'] = {};
  for (const [name, uuid] of Object.entries(DESIGNERS)) {
    try {
      const data = await pfPost<{ items: unknown[]; totalItems?: number }>(
        '/OrderProducts/Search',
        { searchTerm: uuid, pageNumber: 1, pageSize: 5 }
      );
      (results['probe1_uuidAsSearchTerm'] as Record<string, unknown>)[name] = {
        total: data.totalItems ?? data.items?.length,
        sample: data.items?.[0],
      };
    } catch (e) {
      (results['probe1_uuidAsSearchTerm'] as Record<string, unknown>)[name] = { error: String(e) };
    }
  }

  // ── Probe 2: Search with assignedToUserUuid in body ───────────────────────
  // Even though we know status filter is ignored, maybe assignedToUserUuid works
  results['probe2_searchWithUuidBody'] = {};
  const uuid = Object.values(DESIGNERS)[0];
  const searchBodies = [
    { searchTerm: ' ', assignedToUserUuid: uuid, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', userUuid: uuid, pageNumber: 1, pageSize: 3 },
    { searchTerm: '.', assignedToUserUuid: uuid, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', assignedToUserUuid: uuid, startDate: start, endDate: end, pageNumber: 1, pageSize: 3 },
    { searchTerm: ' ', assignedToUserUuid: uuid, eventStartDate: start, eventEndDate: end, pageNumber: 1, pageSize: 3 },
  ];
  for (const body of searchBodies) {
    try {
      const data = await pfPost<{ items: unknown[]; totalItems?: number }>(
        '/OrderProducts/Search', body
      );
      const key = JSON.stringify(body).substring(0, 80);
      (results['probe2_searchWithUuidBody'] as Record<string, unknown>)[key] = {
        total: data.totalItems ?? data.items?.length,
        sampleAssignedTo: (data.items?.[0] as { assignedToUserFirstName?: string })?.assignedToUserFirstName,
      };
    } catch (e) {
      (results['probe2_searchWithUuidBody'] as Record<string, unknown>)[String(Object.keys(body))] = { error: String(e) };
    }
  }

  // ── Probe 3: Get orders for known designers via Search, check eventDate ───
  // We know Search returns orders with frameValetKey. Do those records have
  // an eventDate or updatedAt that represents when the frame was uploaded?
  results['probe3_frameOrderDateFields'] = {};
  const knownFramedOrders = ['46154', '45375', '44891', '46055'];
  for (const num of knownFramedOrders) {
    try {
      const data = await pfPost<{ items: Record<string, unknown>[] }>(
        '/OrderProducts/Search',
        { searchTerm: num, pageNumber: 1, pageSize: 1 }
      );
      const item = data.items?.[0];
      if (!item) continue;
      // Extract all date-like fields
      const dateFields = Object.entries(item)
        .filter(([k]) => k.toLowerCase().includes('date') || k.toLowerCase().includes('at') || k.toLowerCase().includes('time') || k.toLowerCase().includes('updated') || k.toLowerCase().includes('created') || k.toLowerCase().includes('event'))
        .reduce((o, [k, v]) => ({ ...o, [k]: v }), {});
      (results['probe3_frameOrderDateFields'] as Record<string, unknown>)[`order_${num}`] = {
        dateFields,
        frameValetKey: item.frameValetKey,
        assignedTo: item.assignedToUserFirstName,
        status: item.status,
      };
    } catch (e) {
      (results['probe3_frameOrderDateFields'] as Record<string, unknown>)[`order_${num}`] = { error: String(e) };
    }
  }

  // ── Probe 4: Try Sloane's UUID (from her known orders) ────────────────────
  // First get Sloane's UUID, then search her UUID as searchTerm
  results['probe4_sloaneUuid'] = {};
  try {
    const sloane = await pfPost<{ items: { assignedToUserUuid?: string; assignedToUserFirstName?: string }[] }>(
      '/OrderProducts/Search', { searchTerm: '46154', pageNumber: 1, pageSize: 1 }
    );
    // Try a few recent known Sloane order numbers to get her UUID
    const sloaneOrders = ['46154', '45900', '45800', '45700'];
    let sloaneUuid = '';
    for (const orderNum of sloaneOrders) {
      try {
        const r = await pfPost<{ items: { assignedToUserUuid?: string; assignedToUserFirstName?: string }[] }>(
          '/OrderProducts/Search', { searchTerm: orderNum, pageNumber: 1, pageSize: 1 }
        );
        const item = r.items?.[0];
        if (item?.assignedToUserFirstName?.toLowerCase().includes('sloane')) {
          sloaneUuid = item.assignedToUserUuid ?? '';
          (results['probe4_sloaneUuid'] as Record<string, unknown>)['found'] = { orderNum, uuid: sloaneUuid };
          break;
        }
      } catch { /* skip */ }
    }

    if (sloaneUuid) {
      // Search Sloane's UUID as searchTerm
      const byUuid = await pfPost<{ items: unknown[]; totalItems?: number }>(
        '/OrderProducts/Search', { searchTerm: sloaneUuid, pageNumber: 1, pageSize: 5 }
      );
      (results['probe4_sloaneUuid'] as Record<string, unknown>)['searchByUuid'] = {
        total: byUuid.totalItems ?? byUuid.items?.length,
        sample: byUuid.items?.[0],
      };

      // Also try GET with her UUID
      try {
        const byPath = await pfGet<unknown>(`/Users/${sloaneUuid}/OrderProducts?pageNumber=1&pageSize=3`);
        (results['probe4_sloaneUuid'] as Record<string, unknown>)['getUserOrders'] = byPath;
      } catch (e) {
        (results['probe4_sloaneUuid'] as Record<string, unknown>)['getUserOrders'] = { error: String(e) };
      }
    }
  } catch (e) {
    results['probe4_sloaneUuid'] = { error: String(e) };
  }

  // ── Probe 5: Check what ALL fields exist on a Search result ───────────────
  results['probe5_allSearchFields'] = {};
  try {
    const data = await pfPost<{ items: Record<string, unknown>[] }>(
      '/OrderProducts/Search', { searchTerm: '46154', pageNumber: 1, pageSize: 1 }
    );
    const item = data.items?.[0];
    if (item) {
      results['probe5_allSearchFields'] = {
        allKeys: Object.keys(item),
        allValues: item,
      };
    }
  } catch (e) {
    results['probe5_allSearchFields'] = { error: String(e) };
  }

  return NextResponse.json(results);
}
