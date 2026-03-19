import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runStatusSnapshot } from '@/lib/status-snapshot';

export const maxDuration = 300;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await runStatusSnapshot();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scanned: result.scanned, timestamp: new Date().toISOString() });
}
