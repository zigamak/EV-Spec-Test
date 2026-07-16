"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  STAGE_LABEL,
  type AvailabilityReason,
  type EnquiryWithBriefs,
  type VenueAvailability,
  type VenueWithAvailability,
} from "@/lib/api/types";
import { avatarColorForId, toIsoDate } from "@/lib/utils";

const REASON_COLOR: Record<AvailabilityReason, string> = {
  booked: "var(--color-danger)",
  hold: "var(--color-warning)",
  maintenance: "var(--color-text-muted)",
  landlord_blocked: "var(--color-text-muted)",
  other: "var(--color-text-muted)",
};

interface PortfolioWindow extends VenueAvailability {
  venue_name: string;
}

interface UpcomingEnquiry {
  enquiry: EnquiryWithBriefs;
  brief: EnquiryWithBriefs["briefs"][number];
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/** Portfolio-wide availability calendar (task J2) — month view across
 * every active venue, read-only. Booked and hold (with expiry) states
 * shown side by side; holds are still created from the Venue Profile
 * page (B6), not here. "Upcoming events" sidebar (added 16 Jul, reference
 * screenshots) surfaces real enquiries with a known event_date — not
 * fabricated data, just a different view of what already exists. */
export default function PortfolioCalendarPage() {
  const [windows, setWindows] = useState<PortfolioWindow[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEnquiry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const venues = await apiFetch<VenueWithAvailability[]>("/venues/portfolio-availability?status_filter=active");
      setWindows(
        venues.flatMap((venue) => venue.availability.map((a) => ({ ...a, venue_name: venue.name }))),
      );

      const enquiries = await apiFetch<EnquiryWithBriefs[]>("/enquiries");
      const todayIso = toIsoDate(new Date());
      const upcomingEnquiries = enquiries
        .map((enquiry) => ({
          enquiry,
          brief: [...enquiry.briefs].sort((a, b) => b.version - a.version)[0],
        }))
        .filter((x): x is UpcomingEnquiry => !!x.brief?.event_date && x.brief.event_date >= todayIso)
        .sort((a, b) => (a.brief.event_date! < b.brief.event_date! ? -1 : 1));
      setUpcoming(upcomingEnquiries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load calendar");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!windows) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const todayIso = toIsoDate(new Date());
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function windowsOn(day: Date): PortfolioWindow[] {
    const iso = toIsoDate(day);
    return windows!.filter((w) => iso >= w.starts_on && iso <= w.ends_on);
  }

  return (
    <main style={{ padding: "var(--space-8)", display: "flex", gap: "var(--space-8)" }}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>Calendar</h1>

        <div
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            marginTop: "var(--space-6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.3rem", margin: 0 }}>
              {MONTH_FORMAT.format(month)}
            </h2>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
                style={{ width: "28px", height: "28px", border: "1px solid var(--color-border)", borderRadius: "50%", background: "var(--color-bg)", cursor: "pointer" }}
              >
                ←
              </button>
              <button
                onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
                style={{ width: "28px", height: "28px", border: "1px solid var(--color-border)", borderRadius: "50%", background: "var(--color-bg)", cursor: "pointer" }}
              >
                →
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--space-1)" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-1) 0" }}>
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dayWindows = windowsOn(day);
              const isToday = toIsoDate(day) === todayIso;
              return (
                <div key={i} style={{ minHeight: "90px", borderRadius: "var(--radius-sm)", padding: "var(--space-2)", fontSize: "0.72rem" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: isToday ? "var(--color-accent)" : "transparent",
                      color: isToday ? "#fff" : "var(--color-text-muted)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {dayWindows.slice(0, 3).map((w) => (
                    <Link
                      key={w.id}
                      href={`/app/venues/${w.venue_id}`}
                      title={
                        w.reason === "hold" && w.hold_expires_at
                          ? `Hold expires ${new Date(w.hold_expires_at).toLocaleString()}`
                          : undefined
                      }
                      style={{
                        display: "block",
                        marginTop: "2px",
                        padding: "1px 6px",
                        borderRadius: "var(--radius-pill)",
                        background: REASON_COLOR[w.reason],
                        color: "#fff",
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {w.venue_name}
                    </Link>
                  ))}
                  {dayWindows.length > 3 && (
                    <div style={{ color: "var(--color-text-muted)" }}>+{dayWindows.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside style={{ width: "320px", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.3rem", marginBottom: "var(--space-4)" }}>
          Upcoming events
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {upcoming.length === 0 && <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No upcoming events.</p>}
          {upcoming.map(({ enquiry, brief }) => (
            <Link
              key={enquiry.id}
              href={`/app/enquiries/${enquiry.id}`}
              style={{
                display: "block",
                padding: "var(--space-3)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                color: "var(--color-text-primary)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontWeight: 600 }}>{brief.event_type ?? "Untitled enquiry"}</span>
                {enquiry.assigned_to && (
                  <span
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: avatarColorForId(enquiry.assigned_to),
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {enquiry.assigned_to.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                {brief.event_date} · {enquiry.channel}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{STAGE_LABEL[enquiry.stage]}</div>
            </Link>
          ))}
        </div>
      </aside>
    </main>
  );
}
