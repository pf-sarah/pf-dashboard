'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_LABELS: Record<string, string> = {
  bouquetReceived:       'Bouquet Received',
  checkedOn:             'Checked On',
  progress:              'In Progress',
  almostReadyToFrame:    'Almost Ready to Frame',
  readyToFrame:          'Ready to Frame',
  frameCompleted:        'No Response',
  disapproved:           'Disapproved',
  approved:              'Approved',
  noResponse:            'No Response',
  readyToSeal:           'Ready to Seal',
  glued:                 'Glued',
  readyToPackage:        'Ready to Package',
  readyToFulfill:        'Ready to Fulfill',
  preparingToBeShipped:  'Preparing to Ship',
};

const DEPT_STATUSES: Record<string, string[]> = {
  Preservation: ['bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame'],
  Design:       ['readyToFrame', 'frameCompleted', 'disapproved', 'approved'],
  Fulfillment:  ['readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped'],
};

const DEPT_COLORS: Record<string, string> = {
  Preservation: 'border-green-200',
  Design:       'border-indigo-200',
  Fulfillment:  'border-amber-200',
};

const DEPT_TEXT: Record<string, string> = {
  Preservation: 'text-green-700',
  Design:       'text-indigo-700',
  Fulfillment:  'text-amber-700',
};

interface LocationData {
  Utah:        Record<string, number>;
  Georgia:     Record<string, number>;
  unresolved:  number;
  cachedCount: number;
}

function LocationColumn({ name, counts }: { name: string; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{name}</h3>
        <span className="text-xs text-slate-400">{total.toLocaleString()} total</span>
      </div>
      {Object.entries(DEPT_STATUSES).map(([dept, statuses]) => {
        const deptTotal = statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);
        return (
          <Card key={dept} className={`border ${DEPT_COLORS[dept]}`}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className={`text-xs font-semibold uppercase tracking-wide ${DEPT_TEXT[dept]}`}>
                {dept} — {deptTotal.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              {statuses.map(st => {
                const count = counts[st] ?? 0;
                return (
                  <div key={st} className="flex justify-between items-center text-xs">
                    <span className="text-slate-600">{STATUS_LABELS[st] ?? st}</span>
                    <span className={`font-semibold ${count > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                      {count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function SortedLocationSection() {
  const [data,     setData]     = useState<LocationData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/location-counts');
      const json = await res.json() as LocationData & { error?: string };
      if (json.error) { setError(json.error); return; }
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resolveNow() {
    setResolving(true);
    setResolveMsg('');
    try {
      const res  = await fetch('/api/admin/resolve-locations', { method: 'POST' });
      const json = await res.json() as { resolved?: number; total?: number; message?: string; error?: string };
      if (json.error) {
        setResolveMsg(`Failed: ${json.error}`);
      } else {
        setResolveMsg(json.message ?? `Resolved ${json.resolved} of ${json.total} unassigned orders`);
        await load();
      }
    } catch {
      setResolveMsg('Failed to resolve');
    }
    setResolving(false);
  }

  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sorted by Location
          </h2>
          <span className="text-xs text-slate-400">
            PF counts + resolved unassigned orders
          </span>
        </div>
        <div className="flex items-center gap-3">
          {resolveMsg && <span className="text-xs text-slate-400">{resolveMsg}</span>}
          {data && data.unresolved > 0 && (
            <span className="text-xs text-amber-600">
              {data.unresolved.toLocaleString()} orders still unresolved
            </span>
          )}
          <button
            onClick={() => void resolveNow()}
            disabled={resolving}
            className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resolving ? 'Resolving…' : 'Resolve Unassigned'}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading && <p className="text-sm text-slate-400 text-center py-6">Loading location data…</p>}

      {!loading && data && (
        <>
          {data.cachedCount > 0 && (
            <p className="text-xs text-slate-400">
              {data.cachedCount.toLocaleString()} unassigned orders resolved from bouquet upload history
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LocationColumn name="Utah"    counts={data.Utah}    />
            <LocationColumn name="Georgia" counts={data.Georgia} />
          </div>
        </>
      )}
    </section>
  );
}
