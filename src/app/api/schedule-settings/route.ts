import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

// GET /api/schedule-settings?location=Utah
// Returns all settings for a location as a flat object { key: value }
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const location = req.nextUrl.searchParams.get('location') ?? 'Utah';

  const { data, error } = await supabase
    .from('schedule_settings')
    .select('key, value')
    .eq('location', location);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result: Record<string, unknown> = {};
  (data ?? []).forEach(row => { result[row.key] = row.value; });

  return NextResponse.json(result);
}

// POST /api/schedule-settings
// Body: { location, key, value }
// Upserts a single key for a location
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { location: string; key: string; value: unknown };
  const { location, key, value } = body;

  if (!location || !key) {
    return NextResponse.json({ error: 'location and key required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('schedule_settings')
    .upsert(
      { location, key, value, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'location,key' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
