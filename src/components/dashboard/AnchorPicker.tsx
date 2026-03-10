'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AnchorPicker({ currentAnchor }: { currentAnchor: string }) {
  const [value, setValue] = useState(currentAnchor);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    if (!value) return;
    setSaving(true);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'design_anchor_week', value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-slate-500 text-xs">Design anchor:</label>
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 bg-white"
      />
      <button
        onClick={save}
        disabled={saving || value === currentAnchor}
        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Set'}
      </button>
    </div>
  );
}
