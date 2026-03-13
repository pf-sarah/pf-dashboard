'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DesignerFrameData, ResponseTimeResult } from '@/types/dashboard';

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function speedColor(minutes: number): string {
  if (minutes <= 60)  return 'text-emerald-600';
  if (minutes <= 240) return 'text-amber-600';
  return 'text-red-600';
}

export function ResponseTimeSection({ frameData }: { frameData: DesignerFrameData | null }) {
  const [result, setResult]   = useState<ResponseTimeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function calculate() {
    if (!frameData) return;
    setLoading(true);
    setError('');
    setResult(null);

    // Build order list: [{orderUuid, orderNum, designerName}]
    const orders: Array<{ orderUuid: string; orderNum: string; designerName: string }> = [];
    for (const designer of frameData.designers) {
      const allOrderNums = [
        ...designer.ordersByWeek.flat(),
        ...designer.otherOrders,
      ];
      for (const num of allOrderNums) {
        const uuid = frameData.orderUuidMap?.[num];
        if (uuid) orders.push({ orderUuid: uuid, orderNum: num, designerName: designer.name });
      }
    }

    if (!orders.length) {
      setError('No orders with conversation data found.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/response-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      const data = await res.json() as ResponseTimeResult & { error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const designerRows = result
    ? Object.entries(result.byDesigner)
        .filter(([, v]) => v.sampleSize > 0)
        .sort((a, b) => a[1].avgMinutes - b[1].avgMinutes)
    : [];

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Response Times
      </h2>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Client Message → First Designer Reply
              <span className="ml-2 font-normal text-slate-400 text-xs">
                based on orders in current date range
              </span>
            </CardTitle>
            <button
              onClick={calculate}
              disabled={loading || !frameData}
              className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating…' : result ? 'Recalculate' : 'Calculate Response Times'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </CardHeader>
        <CardContent>
          {!result && !loading && (
            <p className="text-sm text-slate-400 py-6 text-center">
              Click &ldquo;Calculate Response Times&rdquo; to analyze designer reply speed.
            </p>
          )}
          {loading && (
            <p className="text-sm text-slate-400 py-6 text-center">
              Fetching conversations… this may take a moment.
            </p>
          )}
          {result && !loading && (
            <>
              {/* Overall */}
              {result.overall.sampleSize > 0 && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg flex items-center gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Team Average</p>
                    <p className={`text-2xl font-bold ${speedColor(result.overall.avgMinutes)}`}>
                      {fmtDuration(result.overall.avgMinutes)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    across {result.overall.sampleSize} responses
                  </p>
                </div>
              )}

              {/* Per designer */}
              {designerRows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  No response data found. The API account may need Admin or Manager access to read conversations.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Designer</th>
                      <th className="text-center py-2 px-4 font-medium text-slate-600">Avg Response</th>
                      <th className="text-center py-2 pl-4 font-medium text-slate-400 text-xs">Responses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {designerRows.map(([name, stats]) => (
                      <tr key={name} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-4 text-slate-700 font-medium">{name}</td>
                        <td className={`text-center py-2 px-4 font-semibold ${speedColor(stats.avgMinutes)}`}>
                          {fmtDuration(stats.avgMinutes)}
                        </td>
                        <td className="text-center py-2 pl-4 text-slate-400 text-xs">
                          {stats.sampleSize}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
