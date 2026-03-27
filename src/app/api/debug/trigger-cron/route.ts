import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 300;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const base = new URL(req.url).origin;
  const res = await fetch(`${base}/api/cron/status-snapshot`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json({ status: res.status, result: data });
}
