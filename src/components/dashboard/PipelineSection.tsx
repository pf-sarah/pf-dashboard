'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PipelineCount {
  status: string;
  location: string;
  count: number;
}

const STATUS_LABELS: Record<string, string> = {
  orderReceived:    'Order Received',
  bouquetReceived:  'Bouquet Received',
  inPreservation:   'In Preservation',
  designReady:      'Design Ready',
  inDesign:         'In Design',
  frameCompleted:   'Frame Complete',
  qualityCheck:     'Quality Check',
  fulfilled:        'Fulfilled',
};

const DEPT_STATUSES: Record<string, string[]> = {
  Preservation: ['bouquetReceived', 'inPreservation'],
  Design:       ['designReady', 'inDesign', 'frameCompleted'],
  Fulfillment:  ['qualityCheck', 'fulfilled'],
};

const DEPT_COLORS: Record<string, string> = {
  Preservation: 'bg-green-50 border-green-200',
  Design:       'bg-indigo-50 border-indigo-200',
  Fulfillment:  'bg-amber-50 border-amber-200',
};

export function PipelineSection({ pipeline }: { pipeline: PipelineCount[] | null }) {
  if (!pipeline) return null;

  const utahCounts: Record<string, number> = {};
  pipeline.forEach(row => {
    if (row.location === 'Utah') utahCounts[row.status] = (utahCounts[row.status] ?? 0) + row.count;
  });

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
        Pipeline — Utah
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(DEPT_STATUSES).map(([dept, statuses]) => {
          const total = statuses.reduce((s, st) => s + (utahCounts[st] ?? 0), 0);
          return (
            <Card key={dept} className={`border ${DEPT_COLORS[dept]}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-700">{dept}</CardTitle>
                <p className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</p>
              </CardHeader>
              <CardContent className="space-y-1">
                {statuses.map(st => (
                  <div key={st} className="flex justify-between text-sm">
                    <span className="text-slate-600">{STATUS_LABELS[st] ?? st}</span>
                    <Badge variant="secondary">{utahCounts[st] ?? 0}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
