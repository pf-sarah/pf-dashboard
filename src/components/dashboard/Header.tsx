'use client';

import { useState } from 'react';
import { UserButton } from '@clerk/nextjs';
import { AnchorPicker } from './AnchorPicker';
import { useRouter } from 'next/navigation';

export function Header({ currentAnchor }: { currentAnchor: string }) {
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState('');
  const router = useRouter();

  async function takeSnapshot() {
    setSnapping(true);
    setSnapMsg('Taking snapshot… (~1 min)');
    try {
      const res = await fetch('/api/snapshot', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setSnapMsg(`✓ Snapshot saved — ${json.designersFound} designers`);
        router.refresh();
      } else {
        setSnapMsg('Error: ' + json.error);
      }
    } catch {
      setSnapMsg('Network error — try again');
    }
    setSnapping(false);
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pressed Floral</h1>
          <p className="text-xs text-slate-500">Department Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <AnchorPicker currentAnchor={currentAnchor} />
          <button
            onClick={takeSnapshot}
            disabled={snapping}
            className="px-3 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {snapping ? 'Snapshotting…' : 'Snapshot Frames'}
          </button>
          <UserButton />
        </div>
      </div>
      {snapMsg && (
        <p className="text-xs mt-1 text-right text-slate-500">{snapMsg}</p>
      )}
    </header>
  );
}
