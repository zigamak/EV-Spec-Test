"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { OWNER_COLOR, TEAM, WHOLE_TEAM } from "@/lib/team";
import type { EnquiryWithBriefs, VenueAvailability, VenueWithAvailability } from "@/lib/api/types";
import { toIsoDate } from "@/lib/utils";

// Only two categories ever render here: signed enquiries (a contract is
// executed) and booked venue-availability windows (the venue itself is
// confirmed for those dates). Every other enquiry stage (enquiry/briefed/
// proposed/held/lost) and every other availability reason (hold/
// maintenance/landlord_blocked/other) is deliberately excluded — this is
// a bookings calendar, not a pipeline view (that's /app which already
// covers the earlier stages).
const SIGNED_COLOR = "var(--color-accent)";
const BOOKED_COLOR = "var(--color-navy)";

// OWNER_COLOR for the owner filter/avatars now comes from lib/team.ts —
// shared with the Pipeline board so a salesperson renders in the same
// color on both pages (previously duplicated here, could drift).

interface BookedWindow extends VenueAvailability {
  venue_name: string;
}

interface SignedEvent {
  enquiry: EnquiryWithBriefs;
  brief: EnquiryWithBriefs["briefs"][number];
  startsOn: string;
  endsOn: string;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Bookings calendar (task J2) — month view of confirmed business only:
 * signed enquiries + booked venue windows. Redesigned 19 Jul toward the
 * "Calendar · bookings" reference (Monday-first week, owner filter by
 * real forwarded_to names, two-category legend with real counts). No
 * fabricated total value in the summary bar — quote_total lives on
 * proposal_venues, one join too many for this pass; counts only, and
 * only of what's actually confirmed. */
export default function PortfolioCalendarPage() {
  const [windows, setWindows] = useState<BookedWindow[] | null>(null);
  const [enquiries, setEnquiries] = useState<EnquiryWithBriefs[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [owner, setOwner] = useState<string>(WHOLE_TEAM);

  const load = useCallback(async () => {
    setError(null);
    try {
      const venues = await apiFetch<VenueWithAvailability[]>("/venues/portfolio-availability?status_filter=active");
      setWindows(
        venues.flatMap((venue) =>
          venue.availability
            .filter((a) => a.reason === "booked")
            .map((a) => ({ ...a, venue_name: venue.name })),
        ),
      );
      setEnquiries(await apiFetch<EnquiryWithBriefs[]>("/enquiries"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load calendar");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signedEvents = useMemo<SignedEvent[]>(() => {
    return enquiries
      .filter((enquiry) => enquiry.stage === "signed")
      .map((enquiry) => ({
        enquiry,
        brief: [...enquiry.briefs].sort((a, b) => b.version - a.version)[0],
      }))
      .filter((x): x is { enquiry: EnquiryWithBriefs; brief: EnquiryWithBriefs["briefs"][number] } => !!x.brief?.date_window_start)
      .map(({ enquiry, brief }) => ({
        enquiry,
        brief,
        startsOn: brief.date_window_start!,
        endsOn: brief.date_window_end ?? brief.date_window_start!,
      }));
  }, [enquiries]);

  const visibleEvents = useMemo(
    () => (owner === WHOLE_TEAM ? signedEvents : signedEvents.filter((e) => e.enquiry.forwarded_to === owner)),
    [signedEvents, owner],
  );

  const todayIso = toIsoDate(new Date());

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
  const leadingBlanks = (firstDay.getDay() + 6) % 7; // Monday-first
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function windowsOn(day: Date): BookedWindow[] {
    const iso = toIsoDate(day);
    return windows!.filter((w) => iso >= w.starts_on && iso <= w.ends_on);
  }

  function eventsOn(day: Date): SignedEvent[] {
    const iso = toIsoDate(day);
    return visibleEvents.filter((e) => iso >= e.startsOn && iso <= e.endsOn);
  }

  const totalSigned = visibleEvents.length;
  const totalBooked = windows.length;
  const selectedDayWindows = selectedDay ? windowsOn(selectedDay) : [];
  const selectedDayEvents = selectedDay ? eventsOn(selectedDay) : [];

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
            Calendar · <em style={{ color: "var(--color-accent)" }}>bookings</em>
          </h1>
          <button onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} style={navButtonStyle}>
            ‹
          </button>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>{MONTH_FORMAT.format(month)}</span>
          <button onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} style={navButtonStyle}>
            ›
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelectedDay(now);
            }}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-bg)",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Today
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            Owner
          </span>
          <OwnerPill label={WHOLE_TEAM} active={owner === WHOLE_TEAM} color="var(--color-text-secondary)" onClick={() => setOwner(WHOLE_TEAM)} />
          {TEAM.map((member) => (
            <OwnerPill
              key={member.name}
              label={member.name.split(" ")[0]!}
              active={owner === member.name}
              color={OWNER_COLOR[member.name] ?? "var(--color-text-secondary)"}
              onClick={() => setOwner(member.name)}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
          marginTop: "var(--space-6)",
          padding: "var(--space-4) var(--space-5)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-6)" }}>
          <LegendItem color={SIGNED_COLOR} label="Signed" hint="Contract executed" />
          <LegendItem color={BOOKED_COLOR} label="Booked" hint="Venue confirmed for these dates" />
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          {totalSigned + totalBooked} event{totalSigned + totalBooked === 1 ? "" : "s"} · {totalSigned} signed · {totalBooked} booked
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-8)", marginTop: "var(--space-6)" }}>
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--color-border)" }}>
            {WEEKDAY_LABELS.map((d) => (
              <div
                key={d}
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.06em",
                  color: "var(--color-text-muted)",
                  padding: "var(--space-3) var(--space-3) var(--space-2)",
                  borderRight: "1px solid var(--color-border)",
                }}
              >
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ borderRight: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }} />;
              const dayWindows = windowsOn(day);
              const dayEvents = eventsOn(day);
              const iso = toIsoDate(day);
              const isToday = iso === todayIso;
              const isSelected = selectedDay && iso === toIsoDate(selectedDay);
              const items = [
                ...dayEvents.map((e) => ({ kind: "event" as const, e })),
                ...dayWindows.map((w) => ({ kind: "window" as const, w })),
              ];

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    minHeight: "108px",
                    padding: "var(--space-2)",
                    fontSize: "0.72rem",
                    textAlign: "left",
                    background: isToday ? "rgba(160, 25, 45, 0.06)" : isSelected ? "var(--color-surface)" : "transparent",
                    border: "none",
                    borderRight: "1px solid var(--color-border)",
                    borderBottom: "1px solid var(--color-border)",
                    outline: isSelected ? "2px solid var(--color-accent)" : "none",
                    outlineOffset: "-2px",
                    cursor: "pointer",
                    font: "inherit",
                    display: "block",
                  }}
                >
                  <span style={{ color: isToday ? "var(--color-accent)" : "var(--color-text-secondary)", fontWeight: isToday ? 700 : 400 }}>
                    {day.getDate()}
                  </span>
                  {items.slice(0, 3).map((item) =>
                    item.kind === "event" ? (
                      <div
                        key={item.e.enquiry.id}
                        title={`${item.e.brief.event_type ?? "Untitled"} · ${item.e.enquiry.forwarded_to ?? "Unassigned"}`}
                        style={{
                          marginTop: "3px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: SIGNED_COLOR,
                          color: "#fff",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.e.brief.event_type ?? "Untitled"}
                      </div>
                    ) : (
                      <div
                        key={item.w.id}
                        title={item.w.venue_name}
                        style={{
                          marginTop: "3px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: BOOKED_COLOR,
                          color: "#fff",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.w.venue_name}
                      </div>
                    ),
                  )}
                  {items.length > 3 && (
                    <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>+{items.length - 3} more</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside style={{ width: "320px", flexShrink: 0 }}>
          {selectedDay ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.2rem", margin: 0 }}>
                  {DAY_FORMAT.format(selectedDay)}
                </h2>
                <button onClick={() => setSelectedDay(null)} style={{ border: "none", background: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "0.85rem" }}>
                  Clear ✕
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {selectedDayEvents.length === 0 && selectedDayWindows.length === 0 && (
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Nothing confirmed on this date.</p>
                )}
                {selectedDayEvents.map(({ enquiry, brief }) => (
                  <Link key={enquiry.id} href={`/app/enquiries/${enquiry.id}`} style={eventCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 600 }}>{brief.event_type ?? "Untitled enquiry"}</span>
                      <span style={{ color: SIGNED_COLOR, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Signed</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                      {brief.date_window_start}
                      {brief.date_window_end && brief.date_window_end !== brief.date_window_start ? ` – ${brief.date_window_end}` : ""}
                      {brief.time_of_day ? ` · ${brief.time_of_day.replace("_", " ")}` : ""}
                    </div>
                    {enquiry.forwarded_to && (
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                        <span
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background: OWNER_COLOR[enquiry.forwarded_to] ?? "var(--color-text-muted)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                          }}
                        >
                          {initials(enquiry.forwarded_to)}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{enquiry.forwarded_to}</span>
                      </div>
                    )}
                  </Link>
                ))}
                {selectedDayWindows.map((w) => (
                  <Link key={w.id} href={`/app/venues/${w.venue_id}`} style={eventCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 600 }}>{w.venue_name}</span>
                      <span style={{ color: BOOKED_COLOR, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Booked</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                      {w.starts_on} – {w.ends_on}
                    </div>
                    {w.note && <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>{w.note}</div>}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.2rem", marginBottom: "var(--space-4)" }}>
                Upcoming
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {(() => {
                  const upcomingEvents = visibleEvents.filter((e) => e.startsOn >= todayIso).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
                  const upcomingWindows = windows.filter((w) => w.ends_on >= todayIso).sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1));
                  if (upcomingEvents.length === 0 && upcomingWindows.length === 0) {
                    return <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Nothing confirmed yet.</p>;
                  }
                  return (
                    <>
                      {upcomingEvents.map(({ enquiry, brief }) => (
                        <Link key={enquiry.id} href={`/app/enquiries/${enquiry.id}`} style={eventCardStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontWeight: 600 }}>{brief.event_type ?? "Untitled enquiry"}</span>
                            <span style={{ color: SIGNED_COLOR, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Signed</span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                            {brief.date_window_start}
                            {enquiry.forwarded_to ? ` · ${enquiry.forwarded_to}` : ""}
                          </div>
                        </Link>
                      ))}
                      {upcomingWindows.map((w) => (
                        <Link key={w.id} href={`/app/venues/${w.venue_id}`} style={eventCardStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontWeight: 600 }}>{w.venue_name}</span>
                            <span style={{ color: BOOKED_COLOR, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Booked</span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                            {w.starts_on} – {w.ends_on}
                          </div>
                        </Link>
                      ))}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function OwnerPill({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-1) var(--space-3)",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${active ? color : "var(--color-border)"}`,
        background: active ? "var(--color-bg)" : "transparent",
        boxShadow: active ? `0 0 0 1px ${color}` : "none",
        cursor: "pointer",
        fontSize: "0.8rem",
        color: "var(--color-text-primary)",
      }}
    >
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </button>
  );
}

function LegendItem({ color, label, hint }: { color: string; label: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: color, display: "inline-block", flexShrink: 0 }} />
      <span>
        <strong style={{ fontSize: "0.85rem" }}>{label}</strong>
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}> — {hint}</span>
      </span>
    </div>
  );
}

const navButtonStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  border: "1px solid var(--color-border)",
  borderRadius: "50%",
  background: "var(--color-bg)",
  cursor: "pointer",
};

const eventCardStyle: React.CSSProperties = {
  display: "block",
  padding: "var(--space-3)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  color: "var(--color-text-primary)",
};
