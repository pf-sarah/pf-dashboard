import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet } from '@/lib/pf-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orderUuid = req.nextUrl.searchParams.get('orderUuid');
  if (!orderUuid) return NextResponse.json({ error: 'orderUuid required' }, { status: 400 });

  try {
    const [messagesData, usersData] = await Promise.all([
      pfPost<{ items?: unknown[] }>('/OrderConversation/Messages', {
        orderUuid,
        pageNumber: 1,
        pageSize: 100,
        offset: 0,
      }).catch(() => null),
      pfGet<unknown[]>(`/OrderConversation/Users/${orderUuid}`).catch(() => null),
    ]);

    return NextResponse.json({ messages: messagesData, users: usersData });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
