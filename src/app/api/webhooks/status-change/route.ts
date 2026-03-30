import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Secret key to verify requests come from the PF app
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Verify the secret header
  const secret = req.headers.get('x-webhook-secret');
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    orderNum: string;
    orderProductKey?: string;
    variantTitle?: string;
    designerUuid?: string;
    designerName?: string;
    location?: string;
    fromStatus?: string;
    toStatus: string;
    changedAt: string; // ISO timestamp from the app
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.orderNum || !body.toStatus || !body.changedAt) {
    return NextResponse.json({ error: 'orderNum, toStatus, changedAt required' }, { status: 400 });
  }

  const { error } = await supabase.from('design_completions').insert({
    order_num:         body.orderNum,
    order_product_key: body.orderProductKey ?? body.orderNum,
    variant_title:     body.variantTitle ?? null,
    designer_uuid:     body.designerUuid ?? null,
    designer_name:     body.designerName ?? null,
    location:          body.location ?? null,
    from_status:       body.fromStatus ?? 'readyToFrame',
    to_status:         body.toStatus,
    changed_at:        body.changedAt,
  });

  if (error) {
    console.error('design_completions insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
