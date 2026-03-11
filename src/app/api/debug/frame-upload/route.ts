import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet, pfPost } from '@/lib/pf-api';

export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // From order 46154's frameValetKey (known framed order)
  const uploadUuid      = '50bd7652-0b72-4194-babd-a0d37a91f8f2';
  const orderProductUuid = '8572ee98-591a-49e4-9e3d-f4ce882008eb';

  const results: Record<string, unknown> = {};

  // Probe 1: Direct upload record by uploadUuid
  const uploadPaths = [
    `/OrderProductUploads/${uploadUuid}`,
    `/Uploads/${uploadUuid}`,
    `/OrderProducts/Uploads/${uploadUuid}`,
    `/FrameUploads/${uploadUuid}`,
  ];
  results['probe1_uploadByUuid'] = {};
  for (const path of uploadPaths) {
    try {
      const data = await pfGet<unknown>(path);
      (results['probe1_uploadByUuid'] as Record<string, unknown>)[path] = data;
    } catch (e) {
      (results['probe1_uploadByUuid'] as Record<string, unknown>)[path] = { error: String(e) };
    }
  }

  // Probe 2: Order product detail by orderProductUuid
  const productPaths = [
    `/OrderProducts/${orderProductUuid}`,
    `/OrderProducts/${orderProductUuid}/Uploads`,
    `/OrderProducts/${orderProductUuid}/History`,
  ];
  results['probe2_orderProductDetail'] = {};
  for (const path of productPaths) {
    try {
      const data = await pfGet<unknown>(path);
      (results['probe2_orderProductDetail'] as Record<string, unknown>)[path] = data;
    } catch (e) {
      (results['probe2_orderProductDetail'] as Record<string, unknown>)[path] = { error: String(e) };
    }
  }

  // Probe 3: Search order 46154 with pageSize=10 to see if multiple items/history come back
  try {
    const data = await pfPost<{ items: unknown[] }>('/OrderProducts/Search', {
      searchTerm: '46154',
      pageNumber: 1,
      pageSize: 10,
    });
    results['probe3_searchAllItems'] = {
      count: data.items?.length,
      items: data.items,
    };
  } catch (e) {
    results['probe3_searchAllItems'] = { error: String(e) };
  }

  // Probe 4: Activity/history endpoints
  const activityPaths = [
    `/OrderProducts/${orderProductUuid}/Activity`,
    `/OrderProducts/${orderProductUuid}/StatusHistory`,
    `/Activity?orderProductUuid=${orderProductUuid}`,
  ];
  results['probe4_activityHistory'] = {};
  for (const path of activityPaths) {
    try {
      const data = await pfGet<unknown>(path);
      (results['probe4_activityHistory'] as Record<string, unknown>)[path] = data;
    } catch (e) {
      (results['probe4_activityHistory'] as Record<string, unknown>)[path] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
