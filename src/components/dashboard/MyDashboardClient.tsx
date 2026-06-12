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
  crossDeptHours?: { dept: string; hours: number }[];
  crossDeptDaily?: { dept: string; daily: number[] }[];
}

interface HistoricalRow {
  weekOf: string;
  hours: number | null;
  orders: number | null;
  ratio: number | null;
  department?: string | null;
}

interface UpcomingWeek {
  weekOf: string;
  scheduledHours: number | null;
  crossDept?: { dept: string; hours: number }[];
}

interface DashboardData {
  dailyHours: number[];
  memberName: string;
  location: string;
  department: string;
  thisWeek: ThisWeek | null;
  historicals: HistoricalRow[];
  upcomingWeeks: UpcomingWeek[];
  avgHours: number | null;
  avgOrders: number | null;
  homeDepartment?: string | null;
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
              {(data?.thisWeek?.crossDeptHours ?? []).length > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span>⚠ Scheduled in multiple departments this week:</span>
                  {(data?.thisWeek?.crossDeptHours ?? []).map((cd, i) => (
                    <span key={i} className="font-medium capitalize">{cd.dept} ({cd.hours}h)</span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Scheduled Hours" value={fmt(data?.thisWeek?.scheduledHours ?? null)} sub="all depts this week" />
                <StatCard
                  label={`${({ design: 'Frames', resin: 'Units' } as Record<string, string>)[data?.homeDepartment ?? data?.department ?? ''] ?? 'Orders'} This Week`}
                  value={data?.thisWeek?.scheduledHours && data?.thisWeek?.targetRatio
                    ? String(Math.round(data.thisWeek.scheduledHours / data.thisWeek.targetRatio))
                    : "—"}
                  sub={data?.thisWeek?.targetRatio ? `based on ${data.thisWeek.targetRatio} hrs/${({ design: 'frame', resin: 'unit' } as Record<string, string>)[data?.homeDepartment ?? data?.department ?? ''] ?? 'order'} ratio` : "based on scheduled hours"}
                />
                <StatCard label="Target Ratio" value={fmt(data?.thisWeek?.targetRatio ?? null, 2)} sub="hrs / order" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Schedule</h2>
                <WeekGrid
                  dailyHours={data?.dailyHours ?? []}
                  ratio={data?.thisWeek?.targetRatio ?? null}
                  crossDeptDaily={data?.thisWeek?.crossDeptDaily ?? []}
                  homeDept={data?.homeDepartment ?? data?.department ?? ""}
                />
              </div>
              <RatioCalculator
                scheduledHours={data?.thisWeek?.scheduledHours ?? null}
                currentRatio={data?.thisWeek?.targetRatio ?? null}
              />
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
                    <div className="flex items-center gap-2">
                      {(w.crossDept ?? []).map((cd, j) => (
                        <span key={j} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 capitalize">
                          +{cd.hours}h {cd.dept}
                        </span>
                      ))}
                      <span className="text-sm text-gray-500">
                        {w.scheduledHours !== null ? `${w.scheduledHours} hrs total` : "— hrs scheduled"}
                      </span>
                    </div>
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
                        <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Dept</th>
                        <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Hours</th>
                        <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Orders</th>
                        <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.historicals ?? []).map((r, i) => {
                        const isHome = !r.department || r.department?.toLowerCase() === (data?.homeDepartment ?? department).toLowerCase();
                        return (
                          <tr key={i} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 text-gray-600">Week of {fmtDate(r.weekOf)}</td>
                            <td className="py-2">
                              {isHome ? (
                                <span className="text-xs text-gray-400 capitalize">{r.department ?? department}</span>
                              ) : (
                                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 capitalize">{r.department}</span>
                              )}
                            </td>
                            <td className="py-2 text-right text-gray-700">{fmt(r.hours)}</td>
                            <td className="py-2 text-right text-gray-700">{fmt(r.orders, 0)}</td>
                            <td className="py-2 text-right text-gray-700">{fmt(r.ratio)}</td>
                          </tr>
                        );
                      })}
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

function RatioCalculator({ scheduledHours, currentRatio }: {
  scheduledHours: number | null;
  currentRatio: number | null;
}) {
  const [goalRatio, setGoalRatio] = useState<string>("");
  const [goalFrames, setGoalFrames] = useState<string>("");

  const frames = scheduledHours && currentRatio
    ? Math.round(scheduledHours / currentRatio)
    : null;

  const hoursNeeded = goalRatio && frames
    ? Math.round(frames * parseFloat(goalRatio) * 10) / 10
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">What-If Calculator</h2>
        <p className="text-xs text-gray-400 mt-0.5">Plan your week around a target ratio</p>
      </div>

      <div className="bg-indigo-50 rounded-lg p-4">
        <p className="text-xs font-medium text-indigo-700 mb-3">
          📐 If I want to complete {frames ?? "—"} frames at a goal ratio of...
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="number" step="0.1" min="0.5" max="3" placeholder="e.g. 1.1"
            value={goalRatio} onChange={e => setGoalRatio(e.target.value)}
            className="w-28 border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-sm text-gray-500">hrs/frame</span>
          {hoursNeeded !== null && (
            <div className="ml-2 text-sm font-semibold text-indigo-700">
              → I would need <span className="text-lg">{hoursNeeded}h</span> this week
            </div>
          )}
        </div>
        {hoursNeeded !== null && scheduledHours && (
          <p className="text-xs text-indigo-500 mt-2">
            {hoursNeeded > scheduledHours
              ? `That's ${Math.round((hoursNeeded - scheduledHours) * 10) / 10}h more than your scheduled ${scheduledHours}h`
              : `That's ${Math.round((scheduledHours - hoursNeeded) * 10) / 10}h less than your scheduled ${scheduledHours}h`}
          </p>
        )}
      </div>

      <div className="bg-rose-50 rounded-lg p-4">
        <p className="text-xs font-medium text-rose-700 mb-3">
          🎯 Working my scheduled {scheduledHours ?? "—"}h, to hit a ratio of...
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="number" step="0.1" min="0.5" max="3" placeholder="e.g. 1.0"
            value={goalFrames} onChange={e => setGoalFrames(e.target.value)}
            className="w-28 border border-rose-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <span className="text-sm text-gray-500">hrs/frame</span>
          {goalFrames && scheduledHours && (
            <div className="ml-2 text-sm font-semibold text-rose-700">
              → I need to complete <span className="text-lg">{Math.round(scheduledHours / parseFloat(goalFrames))}f</span> this week
            </div>
          )}
        </div>
        {goalFrames && scheduledHours && frames !== null && (
          <p className="text-xs text-rose-500 mt-2">
            {Math.round(scheduledHours / parseFloat(goalFrames)) > frames
              ? `That's ${Math.round(scheduledHours / parseFloat(goalFrames)) - frames} more frames than your current target of ${frames}f`
              : `That's ${frames - Math.round(scheduledHours / parseFloat(goalFrames))} fewer frames than your current target of ${frames}f`}
          </p>
        )}
      </div>
    </div>
  );
}

function WeekGrid({ dailyHours, ratio, crossDeptDaily, homeDept }: {
  dailyHours: number[];
  ratio: number | null;
  crossDeptDaily?: { dept: string; daily: number[] }[];
  homeDept?: string;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const monday = new Date();
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));

  return (
    <div className="grid grid-cols-5 gap-3">
      {days.map((dayName, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const homeHours = dailyHours[i] ?? 0;
        const isToday = d.toDateString() === new Date().toDateString();
        const crossToday = (crossDeptDaily ?? [])
          .map(cd => ({ dept: cd.dept, hours: cd.daily[i] ?? 0 }))
          .filter(cd => cd.hours > 0);
        const totalHours = homeHours + crossToday.reduce((s, cd) => s + cd.hours, 0);
        return (
          <div key={dayName} className={`rounded-lg border p-3 text-center ${isToday ? "border-[#703C2E]/30 bg-[#703C2E]/5" : "border-gray-100 bg-gray-50"}`}>
            <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-[#703C2E]" : "text-gray-500"}`}>{dayName}</div>
            <div className="text-xs text-gray-400 mb-2">{dateLabel}</div>
            {totalHours > 0 ? (
              <div className="space-y-1">
                {homeHours > 0 && (
                  <div className="text-sm font-semibold text-gray-800">
                    {homeHours}h <span className="text-xs font-normal text-gray-400 capitalize">{homeDept}</span>
                  </div>
                )}
                {crossToday.map((cd, j) => (
                  <div key={j} className="text-sm font-semibold text-amber-700">
                    {cd.hours}h <span className="text-xs font-normal capitalize">{cd.dept}</span>
                  </div>
                ))}
                {homeHours > 0 && ratio ? (
                  <div className="text-xs text-indigo-500">{Math.round(homeHours / ratio)}f</div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm font-semibold text-gray-300">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
