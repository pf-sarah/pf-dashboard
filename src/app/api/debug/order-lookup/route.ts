import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const num = req.nextUrl.searchParams.get('order') ?? '43515';

  const [pfData, { data: supabaseRows }] = await Promise.all([
    pfPost<unknown>('/OrderProducts/Search', {
      searchTerm: num,
      pageNumber: 1,
      pageSize: 10,
    }).catch(e => ({ error: String(e) })),
    supabase
      .from('order_status_history')
      .select('*')
      .eq('order_num', num)
      .order('first_seen_at', { ascending: false }),
  ]);

  return NextResponse.json({ order: num, pfData, supabaseRows });
}
