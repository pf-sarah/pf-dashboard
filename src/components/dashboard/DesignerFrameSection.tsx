'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConversationDrawer } from '@/components/dashboard/ConversationDrawer';
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

function defaultCohortRange() {
  const today = new Date();
  const dow = today.getDay();
  const lastMon = new Date(today);
  lastMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  const sixMonthsAgo = new Date(lastMon);
  sixMonthsAgo.setMonth(lastMon.getMonth() - 6);
  return {
    start: sixMonthsAgo.toISOString().split('T')[0],
    end:   lastMon.toISOString().split('T')[0],
  };
}

export function DesignerFrameSection({
  frameData: initialFrameData,
  lastWeek,
}: {
  frameData: DesignerFrameData | null;
  lastWeek: LastWeekFrameCounts | null;
}) {
  const defaults = defaultCohortRange();
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [cohortStart, setCohortStart]   = useState(defaults.start);
  const [cohortEnd,   setCohortEnd]     = useState(defaults.end);
  const [frameData, setFrameData]       = useState<DesignerFrameData | null>(initialFrameData);
  const [error, setError]               = useState('');
  const [isPending, startTransition]    = useTransition();
  const [conversation, setConversation] = useState<{ orderNum: string; orderUuid: string } | null>(null);

  function openConversation(orderNum: string) {
    const uuid = frameData?.orderUuidMap?.[orderNum];
    if (!uuid) return;
    setConversation({ orderNum, orderUuid: uuid });
  }

  function applyRange() {
    if (!cohortStart || !cohortEnd) return;
    setError('');
    startTransition(async () => {
      const res = await fetch(`/api/designer-frames?cohortStart=${cohortStart}&cohortEnd=${cohortEnd}`);
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setFrameData(json.designers?.length ? json : null);
    });
  }

  return (
    <section className="space-y-4">
      {conversation && (
        <ConversationDrawer
          orderNum={conversation.orderNum}
          orderUuid={conversation.orderUuid}
          onClose={() => setConversation(null)}
        />
      )}
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
                ? 'Set your anchor date then click "Snapshot Frames" to create the first baseline. Click again next Monday for last week\'s counts.'
                : `First snapshot taken ${lastWeek?.latestDate ?? ''}. Click "Snapshot Frames" next Monday to unlock last week's counts.`}
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
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Framed Orders by Cohort Week
              <span className="ml-2 font-normal text-slate-400 text-xs">
                click a number to see order #s · filtered by order received date
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-500">Order received between:</span>
              <input
                type="date"
                value={cohortStart}
                onChange={e => setCohortStart(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 text-slate-700 bg-white"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={cohortEnd}
                onChange={e => setCohortEnd(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 text-slate-700 bg-white"
              />
              <button
                onClick={applyRange}
                disabled={isPending}
                className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Loading…' : 'Apply'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isPending ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading frames…</div>
          ) : !frameData ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No frames found in this cohort range. Try a wider date range.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 font-medium text-slate-600">Designer</th>
                  {frameData.weekKeys.map(k => (
                    <th key={k} className="text-center py-2 px-2 font-medium text-slate-600 whitespace-nowrap">
                      {fmtWeekKey(k)}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 font-medium text-slate-400 whitespace-nowrap italic">Other</th>
                  <th className="text-center py-2 pl-2 font-medium text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {frameData.designers.map(designer => {
                  const otherCellKey = `${designer.name}~other`;
                  return (
                    <React.Fragment key={designer.name}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-4 text-slate-700 font-medium whitespace-nowrap">
                          {designer.name}
                        </td>
                        {frameData.weekKeys.map((wk, wi) => {
                          const n = designer.weeks[wi];
                          const cellKey = `${designer.name}~${wk}`;
                          return (
                            <td key={wk} className="text-center py-2 px-2">
                              {n > 0 ? (
                                <button
                                  onClick={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)}
                                  className="text-indigo-600 underline decoration-dotted hover:text-indigo-800 font-medium cursor-pointer"
                                  title="Click to see order #s"
                                >
                                  {n}
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center py-2 px-2">
                          {designer.otherCount > 0 ? (
                            <button
                              onClick={() => setExpandedCell(expandedCell === otherCellKey ? null : otherCellKey)}
                              className="text-slate-400 underline decoration-dotted hover:text-slate-600 italic font-medium cursor-pointer"
                              title="Frames from cohort weeks outside displayed range"
                            >
                              {designer.otherCount}
                            </button>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
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
                            <td colSpan={frameData.weekKeys.length + 3} className="py-2 px-4 text-xs text-indigo-700 border-b border-indigo-100">
                              📄 {orders.map((o, oi) => (
                                <span key={o}>
                                  {oi > 0 && ', '}
                                  {frameData.orderUuidMap?.[o] ? (
                                    <button
                                      onClick={() => openConversation(o)}
                                      className="underline decoration-dotted hover:text-indigo-900 cursor-pointer"
                                      title="View conversation"
                                    >
                                      #{o}
                                    </button>
                                  ) : (
                                    <span>#{o}</span>
                                  )}
                                </span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                      {expandedCell === otherCellKey && designer.otherOrders.length > 0 && (
                        <tr key={`${designer.name}-other-expand`} className="bg-slate-50">
                          <td colSpan={frameData.weekKeys.length + 3} className="py-2 px-4 text-xs text-slate-500 border-b border-slate-100">
                            📄 {designer.otherOrders.map((o, oi) => (
                              <span key={o}>
                                {oi > 0 && ', '}
                                {frameData.orderUuidMap?.[o] ? (
                                  <button
                                    onClick={() => openConversation(o)}
                                    className="underline decoration-dotted hover:text-slate-700 cursor-pointer"
                                    title="View conversation"
                                  >
                                    #{o}
                                  </button>
                                ) : (
                                  <span>#{o}</span>
                                )}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
