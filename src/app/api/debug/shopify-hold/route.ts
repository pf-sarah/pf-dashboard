import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token  = process.env.SHOPIFY_ADMIN_TOKEN?.trim();

  if (!domain || !token) {
    return NextResponse.json({ error: 'Missing env vars', domain: !!domain, token: !!token });
  }

  const url = `https://${domain}/admin/api/2024-10/orders.json?status=open&tag=hold&limit=10&fields=id,name,tags`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
    cache: 'no-store',
  });

  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }

  return NextResponse.json({ status: res.status, url, data });
}
