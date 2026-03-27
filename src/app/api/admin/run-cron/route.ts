import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 300;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secret = process.env.CRON_SECRET;
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://project-yx1nc.vercel.app'}/api/cron/status-snapshot`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data);
}
