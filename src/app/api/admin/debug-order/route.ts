import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orderNum = req.nextUrl.searchParams.get('order') ?? '40279';
  const data = await pfPost<any>('/OrderProducts/Search', {
    searchTerm: orderNum,
    pageNumber: 1,
    pageSize: 10,
  });

  return NextResponse.json(data);
}
