import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Triggers the cron snapshot server-side, gated by Clerk auth (no cron secret needed).
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const res = await fetch(`${base}/api/cron/status-snapshot`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, status: res.status, ...json });
}
