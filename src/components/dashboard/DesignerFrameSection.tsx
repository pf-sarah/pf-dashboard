'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DesignerFrameData, LastWeekFrameCounts } from '@/types/dashboard';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtWeekKey(k: string) {
  const d = new Date(k + 'T12:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtDate(s: string) {
  const d = new Date(s + 'T12:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function DesignerFrameSection({
  frameData,
  lastWeek,
}: {
  frameData: DesignerFrameData | null;
  lastWeek: LastWeekFrameCounts | null;
}) {
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Design Production
      </h2>

      {/* Last-week summary */}
      <Card className="border-indigo-200 bg-indigo-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-indigo-800">
            Last Week&apos;s Frame Uploads
            {lastWeek && !lastWeek.pending && lastWeek.prevDate && lastWeek.latestDate && (
              <span className="ml-2 font-normal text-indigo-600 text-xs">
                {fmtDate(lastWeek.prevDate)} – {fmtDate(lastWeek.latestDate)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!lastWeek || lastWeek.pending ? (
            <p className="text-sm text-indigo-600 italic">
              {lastWeek?.snapCount === 0
                ? 'Run takeDesignerFrameSnapshot() in Apps Script to create the first baseline, then again next Monday.'
                : `First snapshot taken ${lastWeek?.latestDate ?? ''}. One more snapshot needed next Monday.`}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {Object.entries(lastWeek.delta ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div key={name} className="bg-white rounded-lg p-3 border border-indigo-100 text-center">
                    <div className="text-2xl font-bold text-indigo-700">{count}</div>
                    <div className="text-xs text-slate-600 mt-1 leading-tight">{name}</div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cohort history table */}
      {frameData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Frame Upload History by Cohort Week
              <span className="ml-2 font-normal text-slate-400 text-xs">
                click a number to see order #s
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 font-medium text-slate-600">Designer</th>
                  {frameData.weekKeys.map(k => (
                    <th key={k} className="text-center py-2 px-2 font-medium text-slate-600 whitespace-nowrap">
                      {fmtWeekKey(k)}
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {frameData.designers.map(designer => (
                  <>
                    <tr key={designer.name} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-700 font-medium whitespace-nowrap">
                        {designer.name}
                      </td>
                      {frameData.weekKeys.map((wk, wi) => {
                        const n = designer.weeks[wi];
                        const cellKey = `${designer.name}~${wk}`;
                        const orders = designer.ordersByWeek[wi] ?? [];
                        return (
                          <td
                            key={wk}
                            className="text-center py-2 px-2"
                          >
                            {n > 0 ? (
                              <button
                                onClick={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)}
                                className="text-indigo-600 underline decoration-dotted hover:text-indigo-800 font-medium cursor-pointer"
                                title={`Click to see order #s`}
                              >
                                {n}
                              </button>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center py-2 pl-2 font-bold text-slate-800">
                        {designer.total}
                      </td>
                    </tr>
                    {frameData.weekKeys.map((wk, wi) => {
                      const cellKey = `${designer.name}~${wk}`;
                      const orders = designer.ordersByWeek[wi] ?? [];
                      if (expandedCell !== cellKey) return null;
                      return (
                        <tr key={`${cellKey}-expand`} className="bg-indigo-50">
                          <td
                            colSpan={frameData.weekKeys.length + 2}
                            className="py-2 px-4 text-xs text-indigo-700 border-b border-indigo-100"
                          >
                            📄 {orders.map(o => `#${o}`).join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
