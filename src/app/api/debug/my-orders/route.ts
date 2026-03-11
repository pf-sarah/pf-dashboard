import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet, pfPost, fmtDate } from '@/lib/pf-api';

export const maxDuration = 300;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: Record<string, unknown> = {};

  // Date range: last work week
  const today   = new Date();
  const dow     = today.getDay();
  const lastMon = new Date(today); lastMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
  const start   = fmtDate(lastMon);
  const end     = fmtDate(lastSun);

  // Get a designer UUID from a known framed order
  let designerUuid = '';
  let designerName = '';
  try {
    const sr = await pfPost<{ items: { assignedToUserUuid?: string; assignedToUserFirstName?: string; assignedToUserLastName?: string }[] }>(
      '/OrderProducts/Search', { searchTerm: '46154', pageNumber: 1, pageSize: 1 }
    );
    const item = sr.items?.[0];
    designerUuid = item?.assignedToUserUuid ?? '';
    designerName = `${item?.assignedToUserFirstName ?? ''} ${item?.assignedToUserLastName ?? ''}`.trim();
    results['designer'] = { uuid: designerUuid, name: designerName };
  } catch (e) {
    results['designer'] = { error: String(e) };
  }

  if (!designerUuid) {
    return NextResponse.json({ error: 'Could not get designer UUID', results });
  }

  // ── Probe 1: WeeklyReport with eventDate params ───────────────────────────
  const eventDateVariants = [
    `/OrderProducts/WeeklyReport?eventStartDate=${start}&eventEndDate=${end}`,
    `/OrderProducts/WeeklyReport?eventStartDate=${start}&eventEndDate=${end}&userUuid=${designerUuid}`,
    `/OrderProducts/WeeklyReport?eventStartDate=${start}&eventEndDate=${end}&assignedToUserUuid=${designerUuid}`,
    `/OrderProducts/WeeklyReport?statusStartDate=${start}&statusEndDate=${end}`,
    `/OrderProducts/WeeklyReport?completedStartDate=${start}&completedEndDate=${end}`,
    `/OrderProducts/WeeklyReport?frameStartDate=${start}&frameEndDate=${end}`,
    `/OrderProducts/WeeklyReport?updatedStartDate=${start}&updatedEndDate=${end}`,
  ];

  const edResults: Record<string, unknown> = {};
  for (const path of eventDateVariants) {
    try {
      const data = await pfGet<unknown[]>(path);
      edResults[path] = { count: Array.isArray(data) ? data.length : '?', sample: Array.isArray(data) ? data[0] : data };
    } catch (e) {
      edResults[path] = { error: String(e) };
    }
  }
  results['probe1_eventDateParams'] = edResults;

  // ── Probe 2: OData-style REST on OrderProducts ────────────────────────────
  const odataVariants = [
    `/OrderProducts?assignedToUserUuid=${designerUuid}&startDate=${start}&endDate=${end}&pageNumber=1&pageSize=3`,
    `/OrderProducts?userUuid=${designerUuid}&eventStartDate=${start}&eventEndDate=${end}&pageNumber=1&pageSize=3`,
    `/OrderProducts?frameStartDate=${start}&frameEndDate=${end}&pageNumber=1&pageSize=3`,
  ];
  const odataResults: Record<string, unknown> = {};
  for (const path of odataVariants) {
    try {
      const data = await pfGet<unknown>(path);
      const count = Array.isArray(data) ? data.length : (data as { totalItems?: number })?.totalItems ?? '?';
      odataResults[path] = { count, sample: Array.isArray(data) ? data[0] : data };
    } catch (e) {
      odataResults[path] = { error: String(e) };
    }
  }
  results['probe2_odataRest'] = odataResults;

  // ── Probe 3: New POST endpoint names ──────────────────────────────────────
  const postEndpoints = [
    '/OrderProducts/MyOrders',
    '/OrderProducts/WorkedOn',
    '/OrderProducts/Activity',
    '/OrderProducts/ByActivity',
    '/OrderProducts/CompletedBy',
    '/OrderProducts/AssignedTo',
    '/Staff/Orders',
    '/Staff/Activity',
    '/User/Orders',
    '/User/Activity',
    '/Activity/OrderProducts',
    '/Reports/DesignerActivity',
    '/Reports/StaffActivity',
    '/Reports/FrameActivity',
    '/OrderProducts/FrameActivity',
    '/OrderProducts/DesignerReport',
  ];

  const postResults: Record<string, unknown> = {};
  const bodies = [
    { pageNumber:1, pageSize:3, userUuid: designerUuid, startDate: start, endDate: end },
    { pageNumber:1, pageSize:3, assignedToUserUuid: designerUuid, startDate: start, endDate: end },
    { pageNumber:1, pageSize:3, userUuid: designerUuid, eventStartDate: start, eventEndDate: end },
  ];

  for (const ep of postEndpoints) {
    for (const body of bodies) {
      try {
        const data = await pfPost<unknown>(ep, body);
        const count = Array.isArray(data) ? data.length :
          (data as { totalItems?: number; items?: unknown[] })?.totalItems ??
          (data as { items?: unknown[] })?.items?.length ?? '?';
        if (count !== '?' || (data as { items?: unknown[] })?.items) {
          postResults[`${ep} (body:${JSON.stringify(body).substring(0,40)})`] = { count, sample: data };
          break; // found something on this endpoint, move on
        }
      } catch {
        // skip 404/405
      }
    }
  }
  results['probe3_postEndpoints'] = postResults;

  // ── Probe 4: WeeklyReport base but wildly different param names ───────────
  const weirdParams = [
    `/OrderProducts/WeeklyReport?from=${start}&to=${end}&staff=${designerUuid}`,
    `/OrderProducts/WeeklyReport?date_from=${start}&date_to=${end}`,
    `/OrderProducts/WeeklyReport?week_start=${start}&week_end=${end}&designer=${designerUuid}`,
    `/OrderProducts/WeeklyReport?startDate=${start}&endDate=${end}&designer=${designerUuid}`,
    `/OrderProducts/WeeklyReport?startDate=${start}&endDate=${end}&staff=${designerUuid}`,
    `/OrderProducts/WeeklyReport?startDate=${start}&endDate=${end}&frameUploadedBy=${designerUuid}`,
    `/OrderProducts/WeeklyReport?startDate=${start}&endDate=${end}&completedBy=${designerUuid}`,
  ];

  const wpResults: Record<string, unknown> = {};
  for (const path of weirdParams) {
    try {
      const data = await pfGet<unknown[]>(path);
      wpResults[path] = { count: Array.isArray(data) ? data.length : '?' };
    } catch (e) {
      wpResults[path] = { error: String(e) };
    }
  }
  results['probe4_weirdParams'] = wpResults;

  // ── Probe 5: Check if base URL has versioned paths ────────────────────────
  const versionedPaths = [
    '/api/OrderProducts/WeeklyReport',
    '/api/v1/OrderProducts/WeeklyReport',
    '/api/v2/OrderProducts/WeeklyReport',
    '/v1/OrderProducts/WeeklyReport',
    '/v2/OrderProducts/WeeklyReport',
  ].map(p => `${p}?startDate=${start}&endDate=${end}`);

  const verResults: Record<string, unknown> = {};
  for (const path of versionedPaths) {
    try {
      const data = await pfGet<unknown[]>(path);
      verResults[path] = { count: Array.isArray(data) ? data.length : '?', sample: Array.isArray(data) ? data[0] : data };
    } catch (e) {
      verResults[path] = { error: String(e) };
    }
  }
  results['probe5_versionedPaths'] = verResults;

  return NextResponse.json(results, { status: 200 });
}
