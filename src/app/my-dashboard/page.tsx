import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Header } from '@/components/dashboard/Header';
import MyDashboardClient from '@/components/dashboard/MyDashboardClient';
import { ImpersonationBanner } from '@/components/dashboard/ImpersonationBanner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function MyDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  if (!profile) redirect('/sign-in');

  // Admins, GMs, and managers use the main dashboard
  if (profile.role !== 'user') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <ImpersonationBanner />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <MyDashboardClient profile={profile} />
      </main>
    </div>
  );
}
