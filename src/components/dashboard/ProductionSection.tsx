'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OrderDetail {
  orderNum:  string;
  variant:   string;
  enteredAt: string;
  eventDate: string;
}

interface StaffRow {
  staff:  string;
  count:  number;
  orders: OrderDetail[];
}

type ProductionData = {
  Preservation: StaffRow[];
  Design:       StaffRow[];
  Fulfillment:  StaffRow[];
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

const DEPT_SUBTITLE: Record<string, string> = {
  Preservation: 'Entered Bouquet Received',
  Design:       'Moved out of Ready to Frame',
  Fulfillment:  'Entered Ready to Package',
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function lastWeekRange(): { start: string; end: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return {
    start: lastMonday.toISOString().split('T')[0],
    end:   lastSunday.toISOString().split('T')[0],
  };
}

function thisWeekRange(): { start: string; end: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  return {
    start: monday.toISOString().split('T')[0],
    end:   todayStr(),
  };
}

export function ProductionSection({ location = 'Utah' }: { location?: string }) {
  const defaultRange = thisWeekRange();
  const [start,    setStart]    = useState(defaultRange.start);
  const [end,      setEnd]      = useState(defaultRange.end);
  const [data,     setData]     = useState<ProductionData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  // expanded key = "Dept|staff name"
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing,  setSyncing]  = useState(false);
  const [syncMsg,  setSyncMsg]  = useState('');

  async function syncNow() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res  = await fetch('/api/admin/sync-now', { method: 'POST' });
      const json = await res.json();
      if (json.error) {
        setSyncMsg(`Sync failed: ${json.error}`);
      } else {
        setSyncMsg(`Synced — ${json.scanned ?? 0} records scanned`);
        await load(start, end);
      }
    } catch {
      setSyncMsg('Sync failed');
    }
    setSyncing(false);
  }

  async function load(s: string, e: string) {
    setLoading(true);
    setError('');
    setExpanded(null);
    try {
      const [presRes, countsRes] = await Promise.all([
        fetch(`/api/pipeline-orders?status=bouquetReceived&location=${encodeURIComponent(location)}`),
        fetch(`/api/production-counts?start=${s}&end=${e}&location=${encodeURIComponent(location)}`),
      ]);

      // Preservation — filter pipeline orders by enteredAt date range
      const presJson   = await presRes.json();
      const presOrders = (presJson.orders ?? []) as {
        num: string; variant: string; staff: string; enteredAt: string; eventDate: string;
      }[];
      const filtered = presOrders.filter(o => o.enteredAt >= s && o.enteredAt <= e);
      const staffMap: Record<string, StaffRow> = {};
      filtered.forEach(o => {
        const staff = o.staff || 'Unassigned';
        if (!staffMap[staff]) staffMap[staff] = { staff, count: 0, orders: [] };
        staffMap[staff].count++;
        staffMap[staff].orders.push({ orderNum: o.num, variant: o.variant, enteredAt: o.enteredAt, eventDate: o.eventDate });
      });
      const Preservation = Object.values(staffMap).sort((a, b) => b.count - a.count);

      // Design + Fulfillment — graceful fallback if production-counts times out
      let countsJson = { Design: [] as StaffRow[], Fulfillment: [] as StaffRow[] };
      try {
        const parsed = await countsRes.json();
        if (!parsed.error) countsJson = parsed;
      } catch {
        // production-counts timed out — Design/Fulfillment show empty
      }

      setData({ Preservation, Design: countsJson.Design ?? [], Fulfillment: countsJson.Fulfillment ?? [] });
    } catch (ex) {
      setError(String(ex));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(start, end); }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(dept: string, staff: string) {
    const key = `${dept}|${staff}`;
    setExpanded(prev => prev === key ? null : key);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Production
          </h2>
          <span className="text-xs text-slate-400">order products entering key status per team member</span>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && <span className="text-xs text-slate-400">{syncMsg}</span>}
          <button
            onClick={syncNow}
            disabled={syncing}
            className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Date range controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { label: 'Today',     range: () => ({ start: todayStr(), end: todayStr() }) },
          { label: 'This Week', range: thisWeekRange },
          { label: 'Last Week', range: lastWeekRange },
        ].map(({ label, range }) => (
          <button
            key={label}
            onClick={() => { const r = range(); setStart(r.start); setEnd(r.end); load(r.start, r.end); }}
            className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {label}
          </button>
        ))}
        <label className="text-xs text-slate-500 flex items-center gap-1">
          From
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="ml-1 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </label>
        <label className="text-xs text-slate-500 flex items-center gap-1">
          To
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="ml-1 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </label>
        <button
          onClick={() => load(start, end)}
          disabled={loading}
          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading && (
        <p className="text-sm text-slate-400 text-center py-6">Loading production data…</p>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(data) as [keyof ProductionData, StaffRow[]][]).map(([dept, rows]) => {
            const total = rows.reduce((s, r) => s + r.count, 0);
            return (
              <Card key={dept} className={`border ${DEPT_COLORS[dept]}`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-base font-semibold ${DEPT_TEXT[dept]}`}>{dept}</CardTitle>
                  <p className="text-xs text-slate-500">{DEPT_SUBTITLE[dept]}</p>
                  <p className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</p>
                </CardHeader>
                <CardContent className="space-y-1">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No data for this period</p>
                  ) : rows.map(r => {
                    const key        = `${dept}|${r.staff}`;
                    const isExpanded = expanded === key;
                    return (
                      <div key={r.staff}>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-700">{r.staff}</span>
                          <button
                            onClick={() => toggleExpand(dept, r.staff)}
                            className="rounded px-2 py-0.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                            title="Click to see orders"
                          >
                            {r.count.toLocaleString()}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-1 mb-2 ml-1 rounded border border-slate-200 bg-white text-xs overflow-auto max-h-64">
                            <table className="min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                                  <th className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap sticky left-0 bg-slate-50">Order #</th>
                                  <th className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap">Frame</th>
                                  <th className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap">Date</th>
                                  <th className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap">Event Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.orders.map(o => (
                                  <tr key={o.orderNum + o.variant} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                    <td className="px-3 py-1.5 font-mono text-indigo-700 whitespace-nowrap sticky left-0 bg-white">#{o.orderNum}</td>
                                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{o.variant || '—'}</td>
                                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{o.enteredAt || '—'}</td>
                                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{o.eventDate || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
      )}
    </section>
  );
}
