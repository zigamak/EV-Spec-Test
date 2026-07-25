"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type { DashboardSummary } from "@/lib/api/types";

const SERIES_COLORS = [
  "var(--color-accent)",
  "var(--color-navy)",
  "var(--color-brass)",
  "var(--color-success)",
  "var(--color-warning)",
];

const money = (n: number, currency = "HKD") =>
  `${currency} ${Math.round(n).toLocaleString()}`;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg)",
        padding: "var(--space-5)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 400,
        fontSize: "1.2rem",
        margin: "0 0 var(--space-4)",
      }}
    >
      {children}
    </h2>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <div style={{ fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "1.9rem",
          marginTop: "var(--space-2)",
          color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
    </Card>
  );
}

/** Operator dashboard (Workspace nav) — the one place both roles land on
 * for a real read of the business, not just their own worklist. Admin
 * sees company-wide revenue/leaderboard/venue sections too; staff's KPIs
 * and funnel are implicitly "my numbers" since enquiries RLS (migration
 * 0022) already scopes their reads to their own assigned rows — no extra
 * filtering needed here. Every number traces to a real column (see
 * api/app/routers/dashboard.py) — nothing on this page is estimated. */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DashboardSummary>("/dashboard")
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <PageLoader label="Loading the dashboard" />
      </main>
    );
  }

  const {
    kpis,
    funnel,
    channel_breakdown,
    upcoming_bookings,
    lost_reasons,
    aging_deals,
    proposal_funnel,
    revenue_trend,
    leaderboard,
    venue_performance,
    workload,
  } = data;
  const isAdmin = data.role === "admin";

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.25rem" }}>
        Dashboard
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
        {isAdmin ? "The whole business, at a glance." : "Your pipeline, at a glance."}
      </p>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-6)" }}>
        <Kpi label="Open" value={String(kpis.open_count)} />
        <Kpi label="Awaiting" value={String(kpis.awaiting_count)} />
        <Kpi label="Won this month" value={String(kpis.won_this_month)} accent />
        <Kpi label="Lost this month" value={String(kpis.lost_this_month)} />
        <Kpi label="Win rate" value={kpis.win_rate_pct === null ? "—" : `${kpis.win_rate_pct}%`} />
        <Kpi label="Pipeline value" value={money(kpis.pipeline_value, kpis.currency)} accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--space-6)", marginTop: "var(--space-8)" }}>
        {/* Funnel */}
        <Card>
          <SectionTitle>Pipeline funnel</SectionTitle>
          <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "-8px", marginBottom: "var(--space-4)" }}>
            Of all active or won enquiries, how far each one has reached. Lost enquiries are excluded.
          </p>
          {funnel.every((f) => f.count === 0) ? (
            <p style={{ color: "var(--color-text-muted)" }}>No enquiries yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <FunnelChart>
                <Tooltip formatter={(value, _name, props) => [String(value), props.payload.label]} />
                <Funnel dataKey="count" data={funnel} isAnimationActive nameKey="label">
                  {funnel.map((f, i) => (
                    <Cell key={f.stage} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: "var(--space-3)", fontSize: "0.8rem" }}>
            {funnel.map((f, i) => (
              <span key={f.stage} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-text-secondary)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: SERIES_COLORS[i % SERIES_COLORS.length], display: "inline-block" }} />
                {f.label} · {f.count}
              </span>
            ))}
          </div>
        </Card>

        {/* Channel breakdown */}
        <Card>
          <SectionTitle>Enquiries by channel</SectionTitle>
          <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "-8px", marginBottom: "var(--space-4)" }}>
            {kpis.total_enquiries} total · {kpis.total_lost} lost (unlike the funnel, this includes lost enquiries).
          </p>
          {channel_breakdown.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>No enquiries yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Tooltip />
                  <Pie data={channel_breakdown} dataKey="count" nameKey="channel" innerRadius={45} outerRadius={80}>
                    {channel_breakdown.map((c, i) => (
                      <Cell key={c.channel} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", fontSize: "0.82rem" }}>
                {channel_breakdown.map((c, i) => (
                  <li key={c.channel} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "var(--color-text-secondary)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: SERIES_COLORS[i % SERIES_COLORS.length], display: "inline-block" }} />
                      {c.channel}
                    </span>
                    <strong>{c.count}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Upcoming bookings */}
      <div style={{ marginTop: "var(--space-8)" }}>
        <Card>
          <SectionTitle>Upcoming bookings · next 14 days</SectionTitle>
          {upcoming_bookings.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Nothing booked in the next two weeks.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {upcoming_bookings.map((b) => (
                <li
                  key={b.proposal_id}
                  style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}
                >
                  <span>
                    <strong>{b.title}</strong> — {b.venue_name}
                  </span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {new Date(b.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Aging pipeline */}
      <div style={{ marginTop: "var(--space-8)" }}>
        <Card>
          <SectionTitle>Needs attention · stuck 14+ days</SectionTitle>
          {aging_deals.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Nothing's been sitting idle — pipeline's moving.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {aging_deals.map((d) => (
                <li
                  key={d.enquiry_id}
                  style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ textTransform: "capitalize" }}>{d.stage}</strong> — {d.summary || "(no content)"}
                    {d.assigned_to_name ? ` · ${d.assigned_to_name}` : ""}
                  </span>
                  <span style={{ color: "var(--color-warning)", flexShrink: 0, fontWeight: 600 }}>{d.days_stuck}d</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Proposal funnel + lost reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)", marginTop: "var(--space-8)" }}>
        <Card>
          <SectionTitle>Proposals by status</SectionTitle>
          {proposal_funnel.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>No proposals yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, proposal_funnel.length * 40)}>
              <BarChart data={proposal_funnel} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 12 }} width={100} style={{ textTransform: "capitalize" }} />
                <Tooltip />
                <Bar dataKey="count" name="Proposals" fill="var(--color-navy)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle>Why deals are lost</SectionTitle>
          {lost_reasons.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Nothing lost yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, lost_reasons.length * 40)}>
              <BarChart data={lost_reasons} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="reason" tick={{ fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" name="Lost" fill="var(--color-danger)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {isAdmin && (
        <>
          <div style={{ marginTop: "var(--space-8)" }}>
            <Card>
              <SectionTitle>Revenue by month</SectionTitle>
              {revenue_trend.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>No signed deals yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={revenue_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => money(Number(v), kpis.currency)} />
                    <Line type="monotone" dataKey="revenue" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)", marginTop: "var(--space-8)" }}>
            <Card>
              <SectionTitle>Team leaderboard</SectionTitle>
              {leaderboard.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>No signed deals yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, leaderboard.length * 44)}>
                  <BarChart data={leaderboard} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="staff_name" tick={{ fontSize: 12 }} width={110} />
                    <Tooltip formatter={(v) => money(Number(v), kpis.currency)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <SectionTitle>Venue performance</SectionTitle>
              {venue_performance.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>No signed deals yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, venue_performance.length * 44)}>
                  <BarChart data={venue_performance} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="venue_name" tick={{ fontSize: 12 }} width={140} />
                    <Tooltip formatter={(v) => money(Number(v), kpis.currency)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="var(--color-navy)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div style={{ marginTop: "var(--space-6)" }}>
            <Card>
              <SectionTitle>Team workload</SectionTitle>
              <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "-8px", marginBottom: "var(--space-4)" }}>
                Who's currently holding the most open + awaiting enquiries — useful for rebalancing assignments.
              </p>
              {workload.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>Nothing assigned yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, workload.length * 44)}>
                  <BarChart data={workload} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="staff_name" tick={{ fontSize: 12 }} width={110} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="open_count" name="Open" stackId="w" fill="var(--color-brass)" />
                    <Bar dataKey="awaiting_count" name="Awaiting" stackId="w" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
