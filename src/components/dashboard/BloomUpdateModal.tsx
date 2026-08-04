'use client';

import { useState } from 'react';

export interface BloomUpdateRow {
  weekOf: string;
  weeksUntilDesigned: number;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function fmtLongDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

// "April 27th - May 3rd" — full month spelled out on both ends, even when
// the week doesn't cross a month boundary, matching the reference format.
function fmtWeekRange(weekOfIso: string): string {
  const start = new Date(weekOfIso + 'T12:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startStr = `${start.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(start.getDate())}`;
  const endStr = `${end.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(end.getDate())}`;
  return `${startStr} - ${endStr}`;
}

function fmtWeeksUntil(n: number): string {
  if (n <= 0) return 'This week';
  return `${n} week${n === 1 ? '' : 's'}`;
}

// ─── Canvas PNG renderer — mirrors the on-screen preview table exactly ──────────
function drawBloomUpdateCanvas(sentAt: string, rows: BloomUpdateRow[]): HTMLCanvasElement {
  const scale = 2; // render at 2x for a crisp download
  const width = 760;
  const rowHeight = 52;
  const headerHeight = 74;
  const titleHeight = 90;
  const padX = 60;
  const height = titleHeight + headerHeight + rows.length * rowHeight + 40;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#2b2b26';
  ctx.textBaseline = 'middle';

  // Title — letter-spaced serif caps, centered
  const title = fmtLongDate(sentAt).toUpperCase();
  ctx.font = '20px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'left';
  let titleWidth = 0;
  for (const ch of title) titleWidth += ctx.measureText(ch).width + 4;
  let x = (width - titleWidth) / 2;
  const titleY = titleHeight / 2 + 8;
  for (const ch of title) {
    ctx.fillText(ch, x, titleY);
    x += ctx.measureText(ch).width + 4;
  }

  const tableTop = titleHeight;
  const tableLeft = padX;
  const tableWidth = width - padX * 2;
  const colSplit = tableLeft + tableWidth * 0.42;
  const tableBottom = tableTop + headerHeight + rows.length * rowHeight;

  ctx.strokeStyle = '#2b2b26';
  ctx.lineWidth = 1;

  // Outer border
  ctx.strokeRect(tableLeft, tableTop, tableWidth, tableBottom - tableTop);
  // Column divider
  ctx.beginPath();
  ctx.moveTo(colSplit, tableTop);
  ctx.lineTo(colSplit, tableBottom);
  ctx.stroke();
  // Header/body divider
  ctx.beginPath();
  ctx.moveTo(tableLeft, tableTop + headerHeight);
  ctx.lineTo(tableLeft + tableWidth, tableTop + headerHeight);
  ctx.stroke();

  function wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Header text — italic serif, centered, wraps within its column
  ctx.font = 'italic 15px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  const col1Center = (tableLeft + colSplit) / 2;
  const col2Center = (colSplit + tableLeft + tableWidth) / 2;
  const col1Lines = wrapText('Blooms Delivered the Week of:', colSplit - tableLeft - 24);
  const col2Lines = wrapText('Estimated remaining time until a design photo is uploaded:', tableLeft + tableWidth - colSplit - 24);
  const headerLineHeight = 20;
  const col1StartY = tableTop + headerHeight / 2 - ((col1Lines.length - 1) * headerLineHeight) / 2;
  const col2StartY = tableTop + headerHeight / 2 - ((col2Lines.length - 1) * headerLineHeight) / 2;
  col1Lines.forEach((line, i) => ctx.fillText(line, col1Center, col1StartY + i * headerLineHeight));
  col2Lines.forEach((line, i) => ctx.fillText(line, col2Center, col2StartY + i * headerLineHeight));

  // Data rows — normal serif, centered
  ctx.font = '15px Georgia, "Times New Roman", serif';
  rows.forEach((row, i) => {
    const rowTop = tableTop + headerHeight + i * rowHeight;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(tableLeft, rowTop);
      ctx.lineTo(tableLeft + tableWidth, rowTop);
      ctx.stroke();
    }
    const rowCenterY = rowTop + rowHeight / 2;
    ctx.fillText(fmtWeekRange(row.weekOf), col1Center, rowCenterY);
    ctx.fillText(fmtWeeksUntil(row.weeksUntilDesigned), col2Center, rowCenterY);
  });

  return canvas;
}

export function downloadBloomUpdatePNG(sentAt: string, rows: BloomUpdateRow[], location: string) {
  const canvas = drawBloomUpdateCanvas(sentAt, rows);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `bloom-update-${location.toLowerCase()}-${sentAt.slice(0, 10)}.png`;
  a.click();
}

// ─── On-screen preview table — visually mirrors the PNG ─────────────────────────
function BloomTablePreview({ sentAt, rows }: { sentAt: string; rows: BloomUpdateRow[] }) {
  return (
    <div className="bg-white px-2 py-4" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
      <div className="text-center text-[15px] tracking-[0.25em] text-stone-800 mb-5">
        {fmtLongDate(sentAt).toUpperCase()}
      </div>
      <table className="w-full border-collapse border border-stone-800 text-[13px] text-stone-800">
        <thead>
          <tr>
            <th className="border-r border-b border-stone-800 px-3 py-3 italic font-normal w-[42%]">Blooms Delivered the Week of:</th>
            <th className="border-b border-stone-800 px-3 py-3 italic font-normal">Estimated remaining time until a design photo is uploaded:</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.weekOf}>
              <td className={`border-r border-stone-800 px-3 py-2.5 text-center ${i > 0 ? 'border-t' : ''}`}>{fmtWeekRange(row.weekOf)}</td>
              <td className={`px-3 py-2.5 text-center ${i > 0 ? 'border-t border-stone-800' : ''}`}>{fmtWeeksUntil(row.weeksUntilDesigned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Preview → confirm → locked-in modal ─────────────────────────────────────────
export function BloomUpdateModal({ rows, location, onClose, onConfirmed }: {
  rows: BloomUpdateRow[];
  location: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [stage, setStage] = useState<'preview' | 'locking' | 'locked' | 'error'>('preview');
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConfirm() {
    setStage('locking');
    try {
      const promiseRes = await fetch('/api/design-promises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, cohorts: rows.map(r => ({ weekOf: r.weekOf, weeksFromNow: r.weeksUntilDesigned })) }),
      });
      if (!promiseRes.ok) throw new Error('Failed to lock in the promise');

      const updateRes = await fetch('/api/bloom-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, rows }),
      });
      if (!updateRes.ok) throw new Error('Failed to save the update record');
      const { update } = await updateRes.json() as { update: { id: number; sent_at: string } };

      setSentAt(update.sent_at);
      setStage('locked');
      onConfirmed();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }

  const displaySentAt = sentAt ?? new Date().toISOString();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">
            {stage === 'locked' ? 'Biweekly bloom update sent' : 'Send biweekly bloom update'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {stage === 'preview' && `This is exactly what will be locked in as the client-facing promise for ${location}.`}
            {stage === 'locking' && 'Locking in…'}
            {stage === 'locked' && 'Locked in and saved to history — download the image to send to clients.'}
            {stage === 'error' && errorMsg}
          </p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto border-y border-slate-100 my-3">
          <BloomTablePreview sentAt={displaySentAt} rows={rows} />
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          {stage === 'preview' && (
            <>
              <button onClick={onClose} className="text-xs px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleConfirm} className="text-xs px-3 py-1.5 bg-indigo-600 rounded text-white hover:bg-indigo-700">Confirm &amp; lock in</button>
            </>
          )}
          {stage === 'locking' && (
            <button disabled className="text-xs px-3 py-1.5 bg-indigo-300 rounded text-white">Locking in…</button>
          )}
          {stage === 'locked' && (
            <>
              <button onClick={onClose} className="text-xs px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Close</button>
              <button onClick={() => downloadBloomUpdatePNG(displaySentAt, rows, location)} className="text-xs px-3 py-1.5 bg-indigo-600 rounded text-white hover:bg-indigo-700">Download PNG</button>
            </>
          )}
          {stage === 'error' && (
            <>
              <button onClick={onClose} className="text-xs px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Close</button>
              <button onClick={handleConfirm} className="text-xs px-3 py-1.5 bg-indigo-600 rounded text-white hover:bg-indigo-700">Retry</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History of everything ever sent ─────────────────────────────────────────────
export function BloomHistoryModal({ updates, loading, location, onClose }: {
  updates: { id: number; sent_at: string; rows: BloomUpdateRow[] }[];
  loading: boolean;
  location: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[80vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Past biweekly bloom updates — {location}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Every update that&apos;s been locked in and sent, oldest promises never shown twice.</p>
          </div>
          <button onClick={onClose} className="text-xs px-2.5 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 shrink-0">Close</button>
        </div>
        <div className="overflow-y-auto px-5 py-3 space-y-2">
          {loading && <p className="text-xs text-slate-400 py-6 text-center">Loading…</p>}
          {!loading && updates.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No bloom updates sent yet.</p>}
          {!loading && updates.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2.5">
              <div>
                <div className="text-sm text-slate-700 font-medium">{fmtLongDate(u.sent_at)}</div>
                <div className="text-[11px] text-slate-400">{u.rows.length} cohort{u.rows.length === 1 ? '' : 's'}</div>
              </div>
              <button
                onClick={() => downloadBloomUpdatePNG(u.sent_at, u.rows, location)}
                className="text-xs px-2.5 py-1 border border-indigo-200 bg-indigo-50 rounded text-indigo-700 hover:bg-indigo-100 shrink-0">
                Download PNG
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
