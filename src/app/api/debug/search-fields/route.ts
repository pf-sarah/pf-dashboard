import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';

export const maxDuration = 30;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch a known framed order so we get a fully-populated record
  const data = await pfPost<{ items: Record<string, unknown>[] }>(
    '/OrderProducts/Search',
    { searchTerm: '46154', pageNumber: 1, pageSize: 1 }
  ).catch(() => null);

  const item = data?.items?.[0];
  if (!item) return NextResponse.json({ error: 'No item found' });

  // Return every field and its value so we can identify the assignment date field
  return NextResponse.json({
    allFields: item,
    dateRelatedFields: Object.fromEntries(
      Object.entries(item).filter(([k]) =>
        k.toLowerCase().includes('date') ||
        k.toLowerCase().includes('at')   ||
        k.toLowerCase().includes('time') ||
        k.toLowerCase().includes('updated') ||
        k.toLowerCase().includes('assigned') ||
        k.toLowerCase().includes('created') ||
        k.toLowerCase().includes('status')
      )
    ),
  });
}
