import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, fmtDate } from '@/lib/pf-api';

// Temporary debug: shows raw WeeklyReport fields for target-status orders
// Hit: /api/debug/production-sample
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetStatus = req.nextUrl.searchParams.get('status') ?? 'bouquetReceived';

  const today = new Date();
  const paths: string[] = [];
  for (let m = 0; m < 4; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`);
  }

  const allResults = await pfGetAll<Record<string, unknown>[]>(paths);

  const matching: unknown[] = [];
  allResults.forEach(items => {
    if (!items) return;
    items.forEach(item => {
      if ((item as Record<string, unknown>).status === targetStatus) {
        matching.push(item);
      }
    });
  });

  // Return first 5 matching items so we can see ALL fields
  return NextResponse.json({
    status: targetStatus,
    totalFound: matching.length,
    sample: matching.slice(0, 5),
  });
}
