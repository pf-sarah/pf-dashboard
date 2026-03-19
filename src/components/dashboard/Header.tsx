'use client';

import { UserButton } from '@clerk/nextjs';

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pressed Floral</h1>
          <p className="text-xs text-slate-500">Department Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
