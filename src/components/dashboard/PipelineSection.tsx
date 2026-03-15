'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PipelineCount {
  status: string;
  location: string;
  count: number;
}

const STATUS_LABELS: Record<string, string> = {
  orderReceived:         'Order Received',
  bouquetReceived:       'Bouquet Received',
  checkedOn:             'Checked On',
  progress:              'In Progress',
  almostReadyToFrame:    'Almost Ready to Frame',
  readyToFrame:          'Ready to Frame',
  frameCompleted:        'Frame Completed',
  approved:              'Approved',
  disapproved:           'Disapproved',
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
  Preservation: 'bg-green-50 border-green-200',
  Design:       'bg-indigo-50 border-indigo-200',
  Fulfillment:  'bg-amber-50 border-amber-200',
};

const DEPT_TEXT: Record<string, string> = {
  Preservation: 'text-green-800',
  Design:       'text-indigo-800',
  Fulfillment:  'text-amber-800',
};

type SortCol = 'num' | 'name' | 'variant' | 'staff' | 'eventDate' | 'orderDate';
type SortDir = 'asc' | 'desc';

export function PipelineSection({ pipeline }: { pipeline: PipelineCount[] | null }) {
  type OrderRow = { id: string; num: string; name: string; variant: string; orderDate: string; eventDate: string; staff: string; days: number; daysLabel: string };

  const [expanded, setExpanded]     = useState<string | null>(null);
  const [orders, setOrders]         = useState<Record<string, OrderRow[]>>({});
  const [loading, setLoading]       = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [sortCol, setSortCol]       = useState<SortCol>('eventDate');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');

  if (!pipeline) return null;

  const utahCounts: Record<string, number> = {};
  pipeline.forEach(row => {
    if (row.location === 'Utah') utahCounts[row.status] = (utahCounts[row.status] ?? 0) + row.count;
  });

  const inQueue = utahCounts['orderReceived'] ?? 0;

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  async function handleStatusClick(status: string) {
    if (expanded === status) {
      setExpanded(null);
      return;
    }

    setExpanded(status);
    setSearch('');
    setSortCol('eventDate');
    setSortDir('asc');
    setFetchError(null);

    if (orders[status]) return; // already loaded

    setLoading(status);
    try {
      const res  = await fetch(`/api/pipeline-orders?status=${status}&location=Utah`);
      const json = await res.json();
      if (json.error) {
        setFetchError(json.error);
      } else {
        setOrders(prev => ({ ...prev, [status]: json.orders ?? [] }));
        setFetchError(null);
      }
    } catch {
      setFetchError('Failed to load orders');
    }
    setLoading(null);
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-1 text-slate-300">↕</span>;
    return <span className="ml-1 text-slate-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function ThBtn({ col, label, className }: { col: SortCol; label: string; className?: string }) {
    return (
      <th
        className={`px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap cursor-pointer select-none hover:text-slate-700 ${className ?? ''}`}
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon col={col} />
      </th>
    );
  }

  return (
    <section>
      <div className="flex items-baseline gap-4 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pipeline — Utah
        </h2>
        <span className="text-xs text-slate-400">
          {inQueue.toLocaleString()} orders in queue (awaiting bouquet)
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(DEPT_STATUSES).map(([dept, statuses]) => {
          const total = statuses.reduce((s, st) => s + (utahCounts[st] ?? 0), 0);
          return (
            <Card key={dept} className={`border ${DEPT_COLORS[dept]}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-base font-semibold ${DEPT_TEXT[dept]}`}>{dept}</CardTitle>
                <p className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</p>
              </CardHeader>
              <CardContent className="space-y-1">
                {statuses.map(st => {
                  const count = utahCounts[st] ?? 0;
                  const isExpanded = expanded === st;
                  const isLoading  = loading === st;
                  const rawRows    = orders[st] ?? [];

                  const q = search.trim().toLowerCase();
                  const filtered = q
                    ? rawRows.filter(o =>
                        o.num.includes(q) ||
                        o.name.toLowerCase().includes(q) ||
                        o.variant.toLowerCase().includes(q) ||
                        o.staff.toLowerCase().includes(q)
                      )
                    : rawRows;

                  const sorted = [...filtered].sort((a, b) => {
                    let va = a[sortCol] ?? '';
                    let vb = b[sortCol] ?? '';
                    if (sortCol === 'num') {
                      const diff = Number(va) - Number(vb);
                      return sortDir === 'asc' ? diff : -diff;
                    }
                    const cmp = String(va).localeCompare(String(vb));
                    return sortDir === 'asc' ? cmp : -cmp;
                  });

                  return (
                    <div key={st}>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">{STATUS_LABELS[st] ?? st}</span>
                        {count > 0 ? (
                          <button
                            onClick={() => handleStatusClick(st)}
                            className="rounded px-2 py-0.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                            title="Click to see order numbers"
                          >
                            {isLoading ? '…' : count.toLocaleString()}
                          </button>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="mt-1 mb-2 ml-1 rounded border border-slate-200 bg-white text-xs">
                          {isLoading ? (
                            <p className="p-3 italic text-slate-400">Loading orders… (scanning up to 30 months)</p>
                          ) : fetchError ? (
                            <p className="p-3 text-red-500">{fetchError}</p>
                          ) : rawRows.length === 0 ? (
                            <p className="p-3 italic text-slate-400">No orders found in last 30 months</p>
                          ) : (
                            <>
                              <div className="px-3 pt-2 pb-1 border-b border-slate-100 flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Search order #, customer, frame, staff…"
                                  value={search}
                                  onChange={e => setSearch(e.target.value)}
                                  className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                />
                                {q && (
                                  <span className="text-slate-400 whitespace-nowrap">
                                    {sorted.length} of {rawRows.length}
                                  </span>
                                )}
                              </div>
                              <div className="overflow-auto max-h-64">
                                <table className="min-w-full" style={{borderCollapse:'separate', borderSpacing:0}}>
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-left">
                                      <ThBtn col="num"       label="Order #"    className="sticky left-0 bg-slate-50" />
                                      <ThBtn col="name"      label="Customer" />
                                      <ThBtn col="variant"   label="Frame" />
                                      <ThBtn col="staff"     label="Staff" />
                                      <ThBtn col="eventDate" label="Event Date" />
                                      <ThBtn col="orderDate" label="Ordered" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sorted.length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="px-3 py-3 text-center text-slate-400 italic">No results</td>
                                      </tr>
                                    ) : sorted.map(o => (
                                      <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                        <td className="px-3 py-1.5 font-mono text-indigo-700 whitespace-nowrap sticky left-0 bg-white">#{o.num}</td>
                                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{o.name}</td>
                                        <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{o.variant}</td>
                                        <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{o.staff || <span className="text-slate-300 italic">unassigned</span>}</td>
                                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{o.eventDate || '—'}</td>
                                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{o.orderDate}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
