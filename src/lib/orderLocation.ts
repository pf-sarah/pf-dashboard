import { supabase } from '@/lib/supabase';

// Live per-order location resolution, mirroring the priority order used by the
// "Resolve Locations" admin job (src/app/api/admin/resolve-locations/route.ts):
// an explicit Shopify "GA" tag wins, otherwise fall back to the location of
// whichever staff member is attached to the order. Applied on the fly here
// instead of depending on a backfill job someone has to remember to run —
// order_status_history.location is only auto-populated for GA-tagged orders,
// so anything else (most Utah orders) sits blank until that job runs.

export interface LocationDetails {
  orderTags?: string[] | null;
  tags?:      string | null;
  orderProductUploads?: { uploadType: string; uploadedByUserFirstName?: string | null; uploadedByUserLastName?: string | null }[];
  preservationUserFirstName?: string;
  preservationUserLastName?:  string;
  assignedToUserFirstName?:   string;
  assignedToUserLastName?:    string;
}

export async function loadStaffLocationMap(): Promise<Record<string, string>> {
  const { data } = await supabase.from('staff_locations').select('name, location');
  const map: Record<string, string> = {};
  data?.forEach(r => { map[r.name] = r.location; });
  return map;
}

export function resolveOrderLocation(details: LocationDetails, staffLocationMap: Record<string, string>): string {
  const tagStr = Array.isArray(details.orderTags) ? details.orderTags.join(',') : (details.tags ?? '');
  if (tagStr.toUpperCase().includes('GA')) return 'Georgia';

  const uploads = details.orderProductUploads ?? [];
  const UPLOAD_PRIORITY = ['bouquet', 'frame'];
  const prioritizedUploads = [
    ...UPLOAD_PRIORITY.map(t => uploads.find(u => u.uploadType === t)),
    ...uploads.filter(u => !UPLOAD_PRIORITY.includes(u.uploadType)),
  ].filter((u): u is NonNullable<typeof u> => !!u);

  for (const upload of prioritizedUploads) {
    const name = [upload.uploadedByUserFirstName, upload.uploadedByUserLastName].filter(Boolean).join(' ').trim();
    if (name && staffLocationMap[name]) return staffLocationMap[name];
  }

  const preservationName = `${details.preservationUserFirstName ?? ''} ${details.preservationUserLastName ?? ''}`.trim();
  if (preservationName && staffLocationMap[preservationName]) return staffLocationMap[preservationName];

  const assignedName = `${details.assignedToUserFirstName ?? ''} ${details.assignedToUserLastName ?? ''}`.trim();
  if (assignedName && staffLocationMap[assignedName]) return staffLocationMap[assignedName];

  return '';
}
