import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet } from '@/lib/pf-api';

export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await pfGet<unknown>('/OrderProducts/CountsByLocation');
    return NextResponse.json({ raw: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
