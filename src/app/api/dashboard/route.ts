import { NextResponse } from 'next/server';
import { pfGet, pfPost, pfGetAll, fmtDate, weekMonday } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';
import type {
  WeeklyReportItem,
  SearchResponse,
  DesignerFrameData,
  LastWeekFrameCounts,
} from '@/types/dashboard';

export const dynamic = 'force-dynamic';

// ── Pipeline counts ────────────────────────────────────────────────────────────
async function getPipelineCounts() {
  try {
    const data = await pfGet<{ status: string; location: string; count: number }[]>(
      '/OrderProducts/CountsByLocation'
    );
    return data;
  } catch {
    return null;
  }
}

// ── Designer frame data (cohort view) ─────────────────────────────────────────
async function getDesignerFrameData(anchorDate: Date): Promise<DesignerFrameData | null> {
  try {
    // Fetch ±6 cohort weeks around anchor in parallel
    const weekPaths: string[] = [];
    const weekKeys: string[] = [];
    for (let w = -6; w <= 6; w++) {
      const mon = new Date(anchorDate.getTime() + w * 7 * 86400000);
      const sun = new Date(mon.getTime() + 6 * 86400000);
      weekPaths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(mon)}&endDate=${fmtDate(sun)}`);
      weekKeys.push(fmtDate(mon));
    }

    const weekResults = await pfGetAll<WeeklyReportItem[]>(weekPaths);

    // Collect Utah order numbers → cohort week
    const orderWeekMap: Record<string, string> = {};
    weekResults.forEach((items, i) => {
      if (!items) return;
      items.forEach(item => {
        if (item.location !== 'Utah') return;
        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
        if (num && !orderWeekMap[num]) orderWeekMap[num] = weekKeys[i];
      });
    });

    const orderNums = Object.keys(orderWeekMap);
    if (!orderNums.length) return null;

    // Batch Search all orders
    const BATCH = 50;
    const orderDesignerMap: Record<string, string> = {};
    const ordersByCell: Record<string, string[]> = {};

    for (let i = 0; i < orderNums.length; i += BATCH) {
      const batch = orderNums.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(num =>
          pfPost<SearchResponse>('/OrderProducts/Search', {
            searchTerm: num, pageNumber: 1, pageSize: 1,
          }).catch(() => null)
        )
      );
      results.forEach((data, j) => {
        const item = data?.items?.[0];
        if (!item?.frameValetKey) return;
        const fn = item.assignedToUserFirstName, ln = item.assignedToUserLastName;
        if (!fn && !ln) return;
        const name = `${fn ?? ''} ${ln ?? ''}`.trim();
        orderDesignerMap[batch[j]] = name;
      });
    }

    if (!Object.keys(orderDesignerMap).length) return null;

    // Group by designer + week
    const byDesigner: Record<string, { weeks: Record<string, number>; orders: Record<string, string[]> }> = {};
    for (const [num, weekKey] of Object.entries(orderWeekMap)) {
      const designer = orderDesignerMap[num];
      if (!designer) continue;
      if (!byDesigner[designer]) byDesigner[designer] = { weeks: {}, orders: {} };
      byDesigner[designer].weeks[weekKey] = (byDesigner[designer].weeks[weekKey] ?? 0) + 1;
      byDesigner[designer].orders[weekKey] = [...(byDesigner[designer].orders[weekKey] ?? []), num];
    }

    const allWeekKeys = [...new Set(
      Object.values(byDesigner).flatMap(d => Object.keys(d.weeks))
    )].sort().slice(-8);

    const designers = Object.entries(byDesigner)
      .map(([name, d]) => ({
        name,
        weeks: allWeekKeys.map(k => d.weeks[k] ?? 0),
        total: allWeekKeys.reduce((s, k) => s + (d.weeks[k] ?? 0), 0),
        ordersByWeek: allWeekKeys.map(k => d.orders[k] ?? []),
      }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total);

    return designers.length ? { designers, weekKeys: allWeekKeys } : null;
  } catch {
    return null;
  }
}

// ── Last-week frame counts from Supabase snapshots ────────────────────────────
async function getLastWeekFrameCounts(): Promise<LastWeekFrameCounts> {
  const { data, error } = await supabase
    .from('frame_snapshots')
    .select('snapshot_date, counts')
    .order('snapshot_date', { ascending: false })
    .limit(2);

  if (error || !data || data.length < 2) {
    return {
      pending: true,
      snapCount: data?.length ?? 0,
      latestDate: data?.[0]?.snapshot_date ?? null,
    };
  }

  const [latest, prev] = data;
  const delta: Record<string, number> = {};
  const allNames = new Set([...Object.keys(latest.counts), ...Object.keys(prev.counts)]);
  allNames.forEach(name => {
    const d = (latest.counts[name] ?? 0) - (prev.counts[name] ?? 0);
    if (d > 0) delta[name] = d;
  });

  return {
    pending: false,
    delta,
    latestDate: latest.snapshot_date,
    prevDate: prev.snapshot_date,
  };
}

// ── GET /api/dashboard ────────────────────────────────────────────────────────
export async function GET() {
  // Load config (anchor date) from Supabase
  const { data: configRow } = await supabase
    .from('dashboard_config')
    .select('value')
    .eq('key', 'design_anchor_week')
    .single()
    .catch(() => ({ data: null }));

  const anchorStr = configRow?.value ?? null;
  const anchorDate = anchorStr
    ? new Date(anchorStr + 'T12:00:00')
    : weekMonday(new Date());

  // Fetch all data in parallel
  const [pipeline, designerFrameData, lastWeekFrameCounts] = await Promise.all([
    getPipelineCounts(),
    getDesignerFrameData(anchorDate),
    getLastWeekFrameCounts(),
  ]);

  return NextResponse.json({
    anchorDate: anchorStr,
    pipeline,
    designerFrameData,
    lastWeekFrameCounts,
    generatedAt: new Date().toISOString(),
  });
}
