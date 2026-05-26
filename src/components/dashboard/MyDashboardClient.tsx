'use client';
import { useState, useEffect } from "react";

type UserProfile = {
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: string;
  location: string | null;
  department: string | null;
  team_member_name: string | null;
};

interface ThisWeek {
  weekOf: string;
  scheduledHours: number | null;
  ordersAssigned: number | null;
  actualHours: number | null;
  targetRatio: number | null;
}

interface HistoricalRow {
  weekOf: string;
  hours: number | null;
  orders: number | null;
  ratio: number | null;
}

interface UpcomingWeek {
  weekOf: string;
  scheduledHours: number | null;
}

interface DashboardData {
  memberName: string;
  location: string;
  department: string;
  thisWeek: ThisWeek | null;
  historicals: HistoricalRow[];
  upcomingWeeks: UpcomingWeek[];
  avgHours: number | null;
  avgOrders: number | null;
}

const TABS = ["This Week", "52-Week Planner", "My Historicals", "My Scorecard"] as const;
type Tab = typeof TABS[number];

function fmt(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(decimals);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MyDashboardClient({ profile }: { profile: UserProfile }) {
  const [tab, setTab] = useState<Tab>("This Week");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const name = profile.full_name.split(" ")[0];
  const location = profile.location ?? "";
  const department = profile.department ?? "";

  useEffect(() => {
    const params = new URLSearchParams();
    if (profile.team_member_name) params.set("memberName", profile.team_member_name);
    if (profile.location)         params.set("location",   profile.location);
    if (profile.department)       params.set("department", profile.department);
    fetch(`/api/my-dashboard?${params.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [profile.team_member_name, profile.location, profile.department]);

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
            {data?.thisWeek?.weekOf ? fmtDate(data.thisWeek.weekOf) : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
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
              tab === t ? "border-[#703C2E] text-[#703C2E]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Loading your data...</div>
      ) : (
        <>
          {/* This Week */}
          {tab === "This Week" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Scheduled Hours" value={fmt(data?.thisWeek?.scheduledHours ?? null)} sub="this week" />
                <StatCard label="Orders Assigned" value={fmt(data?.thisWeek?.ordersAssigned ?? null, 0)} sub="this week" />
                <StatCard label="Target Ratio" value={fmt(data?.thisWeek?.targetRatio ?? null)} sub="hrs / order" />
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
                {(data?.upcomingWeeks ?? []).map((w, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">Week of {fmtDate(w.weekOf)}</span>
                    <span className="text-sm text-gray-500">
                      {w.scheduledHours !== null ? `${w.scheduledHours} hrs scheduled` : "— hrs scheduled"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Historicals */}
          {tab === "My Historicals" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Avg Hours / Week" value={fmt(data?.avgHours ?? null)} sub="last 26 weeks" />
                <StatCard label="Avg Orders / Week" value={fmt(data?.avgOrders ?? null, 0)} sub="last 26 weeks" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Weeks</h2>
                {(data?.historicals ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400">No historical data yet.</p>
                ) : (
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
                      {(data?.historicals ?? []).map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 text-gray-600">Week of {fmtDate(r.weekOf)}</td>
                          <td className="py-2 text-right text-gray-700">{fmt(r.hours)}</td>
                          <td className="py-2 text-right text-gray-700">{fmt(r.orders, 0)}</td>
                          <td className="py-2 text-right text-gray-700">{fmt(r.ratio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* My Scorecard */}
          {tab === "My Scorecard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Disapproval Rate" value="—" sub="last 30 days" />
                <StatCard label="Avg Monthly Ratio" value={fmt(data?.thisWeek?.targetRatio ?? null)} sub="last 3 months" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Ratio History</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Month</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Ratio</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildMonthlyRollup(data?.historicals ?? []).map((m, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-gray-600">{m.month}</td>
                        <td className="py-2 text-right text-gray-700">{fmt(m.ratio)}</td>
                        <td className="py-2 text-right text-gray-700">{fmt(m.orders, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildMonthlyRollup(historicals: HistoricalRow[]) {
  const map: Record<string, { hours: number; orders: number }> = {};
  historicals.forEach(r => {
    const month = new Date(r.weekOf + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!map[month]) map[month] = { hours: 0, orders: 0 };
    map[month].hours  += r.hours  ?? 0;
    map[month].orders += r.orders ?? 0;
  });
  return Object.entries(map).map(([month, d]) => ({
    month,
    ratio:  d.hours > 0 && d.orders > 0 ? Math.round((d.hours / d.orders) * 100) / 100 : null,
    orders: d.orders,
  }));
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
