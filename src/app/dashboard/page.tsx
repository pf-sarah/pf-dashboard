import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { PipelineSection } from '@/components/dashboard/PipelineSection';
import { DesignerFrameSection } from '@/components/dashboard/DesignerFrameSection';
import { AnchorPicker } from '@/components/dashboard/AnchorPicker';

async function getDashboardData() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const res = await fetch(`${base}/api/dashboard`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const data = await getDashboardData();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pressed Floral</h1>
          <p className="text-xs text-slate-500">Department Dashboard</p>
        </div>
        <div className="flex items-center gap-4">
          <AnchorPicker currentAnchor={data?.anchorDate ?? ''} />
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {!data ? (
          <div className="text-center py-20 text-slate-500">
            Failed to load dashboard data. Check your API credentials.
          </div>
        ) : (
          <>
            <PipelineSection pipeline={data.pipeline} />
            <DesignerFrameSection
              frameData={data.designerFrameData}
              lastWeek={data.lastWeekFrameCounts}
            />
          </>
        )}
      </main>
    </div>
  );
}
