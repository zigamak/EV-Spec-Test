"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { AvailabilityReason, Venue, VenueAvailability } from "@/lib/api/types";
import { toIsoDate } from "@/lib/utils";

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

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/** Portfolio-wide availability calendar (task J2) — month view across
 * every active venue, read-only. Booked and hold (with expiry) states
 * shown side by side; holds are still created from the Venue Profile
 * page (B6), not here. */
export default function PortfolioCalendarPage() {
  const [windows, setWindows] = useState<PortfolioWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const venues = await apiFetch<Venue[]>("/venues?status_filter=active");
      const perVenue = await Promise.all(
        venues.map(async (venue) => {
          const availability = await apiFetch<VenueAvailability[]>(`/venues/${venue.id}/availability`);
          return availability.map((a) => ({ ...a, venue_name: venue.name }));
        }),
      );
      setWindows(perVenue.flat());
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
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function windowsOn(day: Date): PortfolioWindow[] {
    const iso = toIsoDate(day);
    return windows!.filter((w) => iso >= w.starts_on && iso <= w.ends_on);
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Portfolio Calendar</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Read-only. Holds and bookings are created from each venue&apos;s profile page.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-6) 0" }}>
        <button
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          ←
        </button>
        <strong>{MONTH_FORMAT.format(month)}</strong>
        <button
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--space-1)" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center" }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dayWindows = windowsOn(day);
          return (
            <div
              key={i}
              style={{
                minHeight: "88px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-1)",
                fontSize: "0.72rem",
              }}
            >
              <div style={{ color: "var(--color-text-muted)" }}>{day.getDate()}</div>
              {dayWindows.slice(0, 4).map((w) => (
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
                    padding: "1px 4px",
                    borderRadius: "3px",
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
              {dayWindows.length > 4 && (
                <div style={{ color: "var(--color-text-muted)" }}>+{dayWindows.length - 4} more</div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
