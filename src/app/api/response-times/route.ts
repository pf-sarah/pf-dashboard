import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet } from '@/lib/pf-api';

export const maxDuration = 60;

interface MessageItem {
  uuid: string;
  messageText: string;
  userUuid: string;
  dateCreated: string;
}

interface MessagesResponse {
  items?: MessageItem[];
}

// Calculate response times from a list of messages.
// clientUuid identifies the client; all others are treated as staff.
// Returns an array of response-time durations (minutes) for each
// client-message → first-staff-reply pair.
function calcResponseMinutes(messages: MessageItem[], clientUuid: string): number[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()
  );
  const times: number[] = [];
  let pendingClientMsg: MessageItem | null = null;

  for (const msg of sorted) {
    if (msg.userUuid === clientUuid) {
      // New client message — start (or restart) the timer
      pendingClientMsg = msg;
    } else if (pendingClientMsg) {
      // First staff reply after a client message
      const diffMs =
        new Date(msg.dateCreated).getTime() -
        new Date(pendingClientMsg.dateCreated).getTime();
      times.push(diffMs / 60000);
      pendingClientMsg = null;
    }
  }
  return times;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Body: { orders: Array<{ orderUuid, orderNum, designerName, clientUserUuid? }> }
  const body = await req.json() as {
    orders: Array<{
      orderUuid: string;
      orderNum: string;
      designerName: string;
    }>;
  };

  if (!body.orders?.length) {
    return NextResponse.json({ byDesigner: {}, overall: { avgMinutes: 0, sampleSize: 0 } });
  }

  // Cap at 80 orders to keep the request fast
  const orders = body.orders.slice(0, 80);

  // Fetch messages for all orders in parallel (batches of 10)
  const BATCH = 10;
  const byDesigner: Record<string, number[]> = {};
  const allTimes: number[] = [];

  interface ConvUser { userUuid: string; clientUser?: boolean; }

  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH);
    const [messagesResults, usersResults] = await Promise.all([
      Promise.all(
        batch.map(o =>
          pfPost<MessagesResponse>('/OrderConversation/Messages', {
            orderUuid: o.orderUuid,
            pageNumber: 1,
            pageSize: 200,
            offset: 0,
          }).catch(() => null)
        )
      ),
      Promise.all(
        batch.map(o =>
          pfGet<ConvUser[]>(`/OrderConversation/Users/${o.orderUuid}`).catch(() => null)
        )
      ),
    ]);

    messagesResults.forEach((data, j) => {
      const order = batch[j];
      const messages = data?.items ?? [];
      if (!messages.length) return;

      const users = usersResults[j] ?? [];
      const clientUser = users.find(u => u.clientUser);
      if (!clientUser) return;

      const times = calcResponseMinutes(messages, clientUser.userUuid);
      if (!times.length) return;

      if (!byDesigner[order.designerName]) byDesigner[order.designerName] = [];
      byDesigner[order.designerName].push(...times);
      allTimes.push(...times);
    });
  }

  const result: Record<string, { avgMinutes: number; sampleSize: number }> = {};
  for (const [name, times] of Object.entries(byDesigner)) {
    result[name] = { avgMinutes: avg(times), sampleSize: times.length };
  }

  return NextResponse.json({
    byDesigner: result,
    overall: { avgMinutes: avg(allTimes), sampleSize: allTimes.length },
  });
}
