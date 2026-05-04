import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_API_VERSION = '2024-01';
const UTAH_LOCATION_ID    = '67995631786';

async function shopifyFetch(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${path}`,
    {
      method,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN!,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  return { status: res.status, data: await res.json() };
}

export async function POST(req: NextRequest) {
  // Auth: cron secret or Clerk session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const dryRun = searchParams.get('dryRun') === 'true';
  const limit  = parseInt(searchParams.get('limit') ?? '50');

  // ── Single order mode: body contains shopifyOrderId + lineItemId ──────────
  let body: { shopifyOrderId?: string; lineItemId?: string } = {};
  try { body = await req.json(); } catch { /* no body = bulk mode */ }

  if (body.shopifyOrderId) {
    // Single order move
    try {
      const { data: foData } = await shopifyFetch(
        `/orders/${body.shopifyOrderId}/fulfillment_orders.json`
      );
      const results: MoveResult[] = [];
      for (const fo of (foData.fulfillment_orders ?? [])) {
        if (String(fo.assigned_location_id) === UTAH_LOCATION_ID) {
          results.push({ orderId: body.shopifyOrderId, orderNumber: '', fulfillmentOrderId: fo.id, status: 'already_utah', dryRun: false });
          continue;
        }
        const { status, data: moveData } = await shopifyFetch(
          `/fulfillment_orders/${fo.id}/move.json`,
          'POST',
          { fulfillment_order: { new_location_id: UTAH_LOCATION_ID } }
        );
        results.push({ orderId: body.shopifyOrderId, orderNumber: '', fulfillmentOrderId: fo.id, status: status === 200 ? 'moved' : status === 422 ? 'cannot_move' : 'error', httpStatus: status, dryRun: false });
      }
      // Update resin_queue origin_location
      if (body.lineItemId) {
        await supabase.from('resin_queue').update({ origin_location: 'Utah' }).eq('line_item_id', body.lineItemId);
      }
      return NextResponse.json({
        moved:       results.filter(r => r.status === 'moved').length,
        alreadyUtah: results.filter(r => r.status === 'already_utah').length,
        cannotMove:  results.filter(r => r.status === 'cannot_move').length,
        results,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // ── Fetch Georgia-origin resin orders that are still unfulfilled ──────────
  const { data: georgiaItems, error } = await supabase
    .from('resin_queue')
    .select('shopify_order_id, shopify_order_number, line_item_id, line_item_title')
    .eq('origin_location', 'Georgia')
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!georgiaItems || georgiaItems.length === 0) {
    return NextResponse.json({ moved: 0, errors: 0, message: 'No Georgia resin orders to move' });
  }

  // ── Get fulfillment orders for each Shopify order ─────────────────────────
  const results: MoveResult[] = [];
  const orderIds = [...new Set(georgiaItems.map(item => item.shopify_order_id))];

  for (const orderId of orderIds) {
    try {
      const { data: foData } = await shopifyFetch(
        `/orders/${orderId}/fulfillment_orders.json`
      );

      const fulfillmentOrders = foData.fulfillment_orders ?? [];

      for (const fo of fulfillmentOrders) {
        // Only move if not already at Utah location
        if (String(fo.assigned_location_id) === UTAH_LOCATION_ID) {
          results.push({
            orderId,
            orderNumber: georgiaItems.find(i => i.shopify_order_id === orderId)?.shopify_order_number ?? '',
            fulfillmentOrderId: fo.id,
            status: 'already_utah',
            dryRun,
          });
          continue;
        }

        if (dryRun) {
          results.push({
            orderId,
            orderNumber: georgiaItems.find(i => i.shopify_order_id === orderId)?.shopify_order_number ?? '',
            fulfillmentOrderId: fo.id,
            status: 'would_move',
            dryRun,
          });
          continue;
        }

        const { status, data: moveData } = await shopifyFetch(
          `/fulfillment_orders/${fo.id}/move.json`,
          'POST',
          { fulfillment_order: { new_location_id: UTAH_LOCATION_ID } }
        );

        results.push({
          orderId,
          orderNumber: georgiaItems.find(i => i.shopify_order_id === orderId)?.shopify_order_number ?? '',
          fulfillmentOrderId: fo.id,
          status: status === 200 ? 'moved' : status === 422 ? 'cannot_move' : 'error',
          httpStatus: status,
          dryRun,
        });
      }
    } catch (err) {
      results.push({
        orderId,
        orderNumber: georgiaItems.find(i => i.shopify_order_id === orderId)?.shopify_order_number ?? '',
        fulfillmentOrderId: null,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        dryRun,
      });
    }
  }

  const moved      = results.filter(r => r.status === 'moved' || r.status === 'would_move').length;
  const errors     = results.filter(r => r.status === 'error').length;
  const cannotMove = results.filter(r => r.status === 'cannot_move').length;
  const alreadyUtah = results.filter(r => r.status === 'already_utah').length;

  return NextResponse.json({
    dryRun,
    georgiaOrdersScanned: orderIds.length,
    moved,
    cannotMove,
    alreadyUtah,
    errors,
    results,
  });
}

interface MoveResult {
  orderId:            string;
  orderNumber:        string;
  fulfillmentOrderId: number | null;
  status:             'moved' | 'would_move' | 'cannot_move' | 'already_utah' | 'error';
  httpStatus?:        number;
  error?:             string;
  dryRun:             boolean;
}
