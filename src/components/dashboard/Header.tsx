'use client';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function Header() {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/schedule',  label: 'Schedule'  },
  ];

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/admin/sync-now', { method: 'POST' });
      const json = await res.json();
      setSyncMsg(json.error ? `Error: ${json.error}` : `Synced — ${json.scanned} records, ${json.deleted} deleted`);
    } catch { setSyncMsg('Sync failed'); }
    setSyncing(false);
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Pressed Floral</h1>
            <p className="text-xs text-slate-500">Department Dashboard</p>
          </div>
          <nav className="flex gap-1">
            {navItems.map(({ href, label }) => (
              <Link key={href} href={href}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith(href) ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}>{label}</Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-xs text-slate-400">{syncMsg}</span>}
          <button onClick={handleSync} disabled={syncing}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
