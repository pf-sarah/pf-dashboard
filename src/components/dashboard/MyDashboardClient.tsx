'use client';
import { useState } from "react";

type UserProfile = {
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: string;
  location: string | null;
  department: string | null;
  team_member_name: string | null;
};

const TABS = ["This Week", "52-Week Planner", "My Historicals", "My Scorecard"] as const;
type Tab = typeof TABS[number];

export default function MyDashboardClient({ profile }: { profile: UserProfile }) {
  const [tab, setTab] = useState<Tab>("This Week");

  const name = profile.full_name.split(" ")[0];
  const location = profile.location ?? "";
  const department = profile.department ?? "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hi, {name} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{department} · {location}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Week of</div>
          <div className="text-sm font-medium text-gray-700">
            {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[#703C2E] text-[#703C2E]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* This Week */}
      {tab === "This Week" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Scheduled Hours" value="—" sub="this week" />
            <StatCard label="Orders Assigned" value="—" sub="this week" />
            <StatCard label="Target Ratio" value="—" sub="orders / hour" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Schedule</h2>
            <WeekGrid />
          </div>
        </div>
      )}

      {/* 52-Week Planner */}
      {tab === "52-Week Planner" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Your Tentative Schedule</h2>
          <p className="text-sm text-gray-400 mb-6">Forward-looking schedule based on current planning.</p>
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i * 7);
              const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-600">Week of {label}</span>
                  <span className="text-sm text-gray-400">— hrs scheduled</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Historicals */}
      {tab === "My Historicals" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Avg Hours / Week" value="—" sub="last 4 weeks" />
            <StatCard label="Avg Orders / Week" value="—" sub="last 4 weeks" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Weeks</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Week</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Hours</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Orders</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - i * 7);
                  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-600">Week of {label}</td>
                      <td className="py-2 text-right text-gray-400">—</td>
                      <td className="py-2 text-right text-gray-400">—</td>
                      <td className="py-2 text-right text-gray-400">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* My Scorecard */}
      {tab === "My Scorecard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Disapproval Rate" value="—" sub="last 30 days" />
            <StatCard label="Avg Monthly Ratio" value="—" sub="last 3 months" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Ratio History</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Month</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Ratio</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Disapprovals</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - i);
                  const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-600">{label}</td>
                      <td className="py-2 text-right text-gray-400">—</td>
                      <td className="py-2 text-right text-gray-400">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

function WeekGrid() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="grid grid-cols-5 gap-3">
      {days.map(day => (
        <div key={day} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
          <div className="text-xs font-medium text-gray-500 mb-2">{day}</div>
          <div className="text-sm text-gray-400">—</div>
        </div>
      ))}
    </div>
  );
}
