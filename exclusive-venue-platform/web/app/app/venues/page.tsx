"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Venue, VenueStatus, VenueWithPortfolio } from "@/lib/api/types";

const STATUS_LABEL: Record<VenueStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  inactive: "Inactive",
};

const STATUS_STYLE: Record<VenueStatus, React.CSSProperties> = {
  draft: { background: "var(--color-surface)", color: "var(--color-text-secondary)" },
  pending_approval: { background: "#fdf1e0", color: "var(--color-warning)" },
  active: { background: "var(--color-navy)", color: "#fff" },
  inactive: { background: "#fbe4e6", color: "var(--color-danger)" },
};

interface VenueCard extends Venue {
  heroUrl: string | null;
  maxCapacity: number | null;
}

/** Venue Library — list/search/filter (task B3), card-grid layout reworked
 * 16 Jul toward client-shared reference screenshots. Category filter pills
 * (Villas/Event Spaces/F&B/Yachts) from the reference aren't shown here —
 * there's no category field in the schema, and this only ever shows real
 * data (hero photo, capacity, status, ownership), never fabricated fields. */
export default function VenueLibraryPage() {
  const [venues, setVenues] = useState<VenueCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VenueStatus | "">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setVenues(null);

    const query = statusFilter ? `?status_filter=${statusFilter}` : "";
    apiFetch<VenueWithPortfolio[]>(`/venues/portfolio${query}`)
      .then((data) => {
        const withExtras = data.map((venue) => {
          const media = venue.venue_media;
          const configs = venue.venue_configurations;
          const hero = media.find((m) => m.kind === "photo") ?? media[0];
          const maxCapacity = configs.length ? Math.max(...configs.map((c) => c.capacity)) : null;
          return { ...venue, heroUrl: hero?.url ?? null, maxCapacity };
        });
        if (!cancelled) setVenues(withExtras);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load venues");
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!venues) return [];
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.district?.toLowerCase().includes(q) ||
        v.slug.toLowerCase().includes(q),
    );
  }, [venues, search]);

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
          Venues
        </h1>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <input
            placeholder="Search name, district, slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-pill)",
              width: "220px",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VenueStatus | "")}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-pill)",
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Link
            href="/app/venues/new"
            style={{
              padding: "var(--space-2) var(--space-5)",
              background: "var(--color-accent)",
              color: "#fff",
              borderRadius: "var(--radius-pill)",
              textDecoration: "none",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            + New venue
          </Link>
        </div>
      </div>

      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>}
      {!error && venues === null && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>Loading…</p>
      )}
      {venues !== null && filtered.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>No venues found.</p>
      )}

      {filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-6)",
            marginTop: "var(--space-8)",
          }}
        >
          {filtered.map((venue) => (
            <Link
              key={venue.id}
              href={`/app/venues/${venue.id}`}
              style={{
                display: "block",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                textDecoration: "none",
                color: "var(--color-text-primary)",
              }}
            >
              <div style={{ position: "relative", width: "100%", height: "160px", background: "var(--color-surface)" }}>
                {venue.heroUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={venue.heroUrl}
                    alt={venue.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    No photo yet
                  </div>
                )}
                <span
                  style={{
                    position: "absolute",
                    top: "var(--space-3)",
                    right: "var(--space-3)",
                    padding: "2px var(--space-3)",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    ...STATUS_STYLE[venue.status],
                  }}
                >
                  {STATUS_LABEL[venue.status]}
                </span>
              </div>

              <div style={{ padding: "var(--space-4)" }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem" }}>{venue.name}</div>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "var(--space-1) 0 var(--space-3)" }}>
                  {venue.district ?? "—"}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  <span>{venue.maxCapacity ? `👥 ${venue.maxCapacity} max` : "Capacity TBD"}</span>
                  <span>{venue.landlord_id ? "Landlord" : "Exclusive Venue"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
