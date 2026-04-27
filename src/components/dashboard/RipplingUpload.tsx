'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

interface UploadResult {
  inserted:    number;
  people:      number;
  dateRange:   { from: string; to: string };
  departments: string[];
  totalGross:  number;
  names:       string[];
}

interface RipplingRow {
  fullName:       string;
  department:     string;
  location:       string;
  title:          string;
  employmentType: string;
  grossPay:       number;
  bonusAmount:    number;
  checkDate:      string;
}

function excelDateToISO(val: unknown): string {
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.split('T')[0];
  if (typeof val === 'number') {
    // Excel serial date → JS date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val ?? '');
}

function fmt$(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RipplingUpload() {
  const [status,   setStatus]   = useState<'idle' | 'parsing' | 'uploading' | 'done' | 'error'>('idle');
  const [result,   setResult]   = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [preview,  setPreview]  = useState<RipplingRow[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function parseXLSX(file: File): Promise<RipplingRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data  = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb    = XLSX.read(data, { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

          const parsed: RipplingRow[] = rows.map(row => ({
            fullName:       String(row['Full name'] ?? row['Employee'] ?? '').trim(),
            department:     String(row['Department name'] ?? row['Department'] ?? '').trim(),
            location:       String(row['Work location'] ?? row['Location name'] ?? '').trim(),
            title:          String(row['Title'] ?? '').trim(),
            employmentType: String(row['Employment type'] ?? '').trim(),
            grossPay:       parseFloat(String(row['Gross pay'] ?? '0')) || 0,
            bonusAmount:    parseFloat(String(row['Bonus amount'] ?? '0')) || 0,
            checkDate:      excelDateToISO(row['Check date']),
          })).filter(r => r.fullName && r.checkDate && r.grossPay > 0);

          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFile(file: File) {
    setStatus('parsing');
    setErrorMsg('');
    setResult(null);
    try {
      const rows = await parseXLSX(file);
      setPreview(rows);
      setStatus('idle');
    } catch (err) {
      setErrorMsg(`Failed to parse file: ${String(err)}`);
      setStatus('error');
    }
  }

  async function handleUpload() {
    if (!preview) return;
    setStatus('uploading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/rippling-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      });
      const data = await res.json() as UploadResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Upload failed');
      setResult(data);
      setPreview(null);
      setStatus('done');
    } catch (err) {
      setErrorMsg(String(err));
      setStatus('error');
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Rippling Payroll Upload</h3>
          <p className="text-xs text-slate-400 mt-0.5">Upload the &quot;Payroll Cost by Location and Department&quot; report from Rippling. Data is stored securely and used for actual CPO calculations.</p>
        </div>
        <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-2 py-1">biweekly</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Drop zone */}
        {status !== 'done' && (
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/20 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <div className="text-2xl mb-2">📄</div>
            <p className="text-sm font-medium text-slate-600">Drop Rippling XLSX here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Payroll Cost by Location and Department report</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {/* Parsing indicator */}
        {status === 'parsing' && (
          <div className="text-center py-4 text-sm text-slate-500">Parsing file…</div>
        )}

        {/* Preview */}
        {preview && status === 'idle' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Rows found</p>
                <p className="text-lg font-semibold text-slate-700">{preview.length}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">People</p>
                <p className="text-lg font-semibold text-slate-700">{new Set(preview.map(r => r.fullName)).size}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Date range</p>
                <p className="text-xs font-medium text-slate-700">
                  {fmtDate([...preview.map(r => r.checkDate)].sort()[0])} –<br />
                  {fmtDate([...preview.map(r => r.checkDate)].sort().reverse()[0])}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total gross</p>
                <p className="text-lg font-semibold text-slate-700">{fmt$(preview.reduce((s, r) => s + r.grossPay, 0))}</p>
              </div>
            </div>

            {/* People list */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-2">People in this upload</p>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(preview.map(r => r.fullName))].map(name => (
                  <span key={name} className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">{name}</span>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleUpload} disabled={status !== 'idle'}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                Upload {preview.length} rows
              </button>
              <button onClick={() => { setPreview(null); if (inputRef.current) inputRef.current.value = ''; }}
                className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Uploading */}
        {status === 'uploading' && (
          <div className="text-center py-4 text-sm text-slate-500">Uploading to Supabase…</div>
        )}

        {/* Success */}
        {status === 'done' && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700">
              <span className="text-lg">✓</span>
              <span className="text-sm font-semibold">Upload successful</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Rows imported</p>
                <p className="text-lg font-semibold text-green-700">{result.inserted}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">People</p>
                <p className="text-lg font-semibold text-green-700">{result.people}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Date range</p>
                <p className="text-xs font-medium text-slate-700">
                  {fmtDate(result.dateRange.from)} –<br />{fmtDate(result.dateRange.to)}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total gross</p>
                <p className="text-lg font-semibold text-green-700">{fmt$(result.totalGross)}</p>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Departments covered</p>
              <div className="flex flex-wrap gap-1.5">
                {result.departments.map(d => (
                  <span key={d} className="text-xs bg-white border border-green-200 rounded px-2 py-0.5 text-green-700">{d}</span>
                ))}
              </div>
            </div>
            <button onClick={() => { setStatus('idle'); setResult(null); if (inputRef.current) inputRef.current.value = ''; }}
              className="text-xs text-indigo-600 hover:text-indigo-800">
              Upload another file
            </button>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
            {errorMsg}
            <button onClick={() => setStatus('idle')} className="ml-3 text-xs underline">Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
