'use client';

import { useMemo, useState } from 'react';
import { PipelineSection } from './PipelineSection';
import { ProductionSection } from './ProductionSection';
import { ResponseTimeSection } from './ResponseTimeSection';
import { EventDateSection } from './EventDateSection';

interface PipelineCount {
  status: string;
  location: string;
  count: number;
}

export function DashboardClient({ pipeline }: { pipeline: PipelineCount[] }) {
  const locations = useMemo(() => {
    const locs = [...new Set(pipeline.map(r => r.location))].filter(Boolean).sort();
    return ['All', ...locs];
  }, [pipeline]);

  const [location, setLocation] = useState('Utah');

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
        <div className="flex gap-1.5 flex-wrap">
          {locations.map(loc => (
            <button
              key={loc}
              onClick={() => setLocation(loc)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                location === loc
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      <PipelineSection pipeline={pipeline} location={location} />
      <EventDateSection />
      <ProductionSection location={location} />
      <ResponseTimeSection location={location} />
    </div>
  );
}
