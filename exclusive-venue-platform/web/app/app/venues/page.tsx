"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  VENUE_CATEGORIES,
  VENUE_CATEGORY_LABEL,
  type Venue,
  type VenueCategory,
  type VenueStatus,
  type VenueWithPortfolio,
} from "@/lib/api/types";

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

// Deterministic placeholder gradients (keyed off venue id) for venues with
// no hero photo yet — cosmetic only, never a stand-in for real venue data.
const HERO_GRADIENTS = [
  "linear-gradient(135deg, #5c7789, #26333c)",
  "linear-gradient(135deg, #cbb489, #8a7550)",
  "linear-gradient(135deg, #4a3628, #1a1210)",
  "linear-gradient(135deg, #6b5b73, #2b232f)",
];

function gradientFor(id: string): string {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return HERO_GRADIENTS[sum % HERO_GRADIENTS.length]!;
}

interface VenueCard extends Venue {
  heroUrl: string | null;
  photoCount: number;
  maxCapacity: number | null;
  layoutCount: number;
}

/** Venue Library — portfolio grid (task B3), redesigned toward the
 * "Operator Console — Design Theme Brief" reference screenshots (18 Jul):
 * category ribbon (now real, backed by venues.category — migration 0011),
 * gradient hero placeholders, and a card layout matching the brief.
 * Every value shown is real: district as the card tag (the reference's
 * per-venue mood tags aren't a field we have), category as "type", and
 * layout count where the reference shows a min-booking-hours stat we have
 * no column for — never fabricated to match the screenshot pixel-for-pixel. */
export default function VenueLibraryPage() {
  const [venues, setVenues] = useState<VenueCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VenueStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<VenueCategory | "">("");
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
          return {
            ...venue,
            heroUrl: hero?.url ?? null,
            photoCount: media.filter((m) => m.kind === "photo").length,
            maxCapacity,
            layoutCount: configs.length,
          };
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

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<VenueCategory, number>> = {};
    for (const v of venues ?? []) {
      if (v.category) counts[v.category] = (counts[v.category] ?? 0) + 1;
    }
    return counts;
  }, [venues]);

  const filtered = useMemo(() => {
    if (!venues) return [];
    let list = venues;
    if (categoryFilter) list = list.filter((v) => v.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.district?.toLowerCase().includes(q) ||
          v.slug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [venues, categoryFilter, search]);

  const districtCount = useMemo(() => {
    if (!venues) return 0;
    return new Set(venues.map((v) => v.district).filter(Boolean)).size;
  }, [venues]);

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.25rem" }}>
            The <em style={{ color: "var(--color-accent)" }}>portfolio</em>
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
            {venues === null
              ? "Loading…"
              : `${venues.length} venue${venues.length === 1 ? "" : "s"}${
                  districtCount ? ` across ${districtCount} district${districtCount === 1 ? "" : "s"}` : ""
                }. Add to any proposal in one click.`}
          </p>
        </div>
        <Link
          href="/app/venues/new"
          style={{
            padding: "var(--space-3) var(--space-6)",
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "var(--radius-pill)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          + Add venue
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
          marginTop: "var(--space-8)",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
          <CategoryTab
            label="All venues"
            count={venues?.length ?? 0}
            active={categoryFilter === ""}
            onClick={() => setCategoryFilter("")}
          />
          {VENUE_CATEGORIES.filter((c) => categoryCounts[c]).map((c) => (
            <CategoryTab
              key={c}
              label={VENUE_CATEGORY_LABEL[c]}
              count={categoryCounts[c] ?? 0}
              active={categoryFilter === c}
              onClick={() => setCategoryFilter(c)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <input
            placeholder="Search name, district, slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-pill)",
              width: "200px",
              fontSize: "0.85rem",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VenueStatus | "")}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-pill)",
              fontSize: "0.85rem",
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-6)" }}>{error}</p>}
      {!error && venues !== null && filtered.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-6)" }}>No venues found.</p>
      )}

      {filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "var(--space-8)",
            marginTop: "var(--space-8)",
          }}
        >
          {filtered.map((venue) => (
            <VenueCardTile key={venue.id} venue={venue} />
          ))}
        </div>
      )}
    </main>
  );
}

function CategoryTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
        padding: "0 0 var(--space-3)",
        cursor: "pointer",
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        fontWeight: active ? 600 : 400,
        fontSize: "0.75rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label} <span style={{ color: "var(--color-text-muted)" }}>{count}</span>
    </button>
  );
}

function VenueCardTile({ venue }: { venue: VenueCard }) {
  return (
    <Link
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
      <div style={{ position: "relative", width: "100%", height: "180px", background: gradientFor(venue.id) }}>
        {venue.heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.heroUrl}
            alt={venue.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
          />
        )}
        {venue.district && (
          <span
            style={{
              position: "absolute",
              top: "var(--space-3)",
              left: "var(--space-3)",
              padding: "3px var(--space-3)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "var(--color-navy)",
              color: "#fff",
            }}
          >
            {venue.district}
          </span>
        )}
        {venue.status !== "active" && (
          <span
            style={{
              position: "absolute",
              top: "var(--space-3)",
              right: "var(--space-3)",
              padding: "2px var(--space-3)",
              borderRadius: "var(--radius-pill)",
              fontSize: "0.7rem",
              fontWeight: 600,
              ...STATUS_STYLE[venue.status],
            }}
          >
            {STATUS_LABEL[venue.status]}
          </span>
        )}
        {venue.photoCount > 0 && (
          <span
            style={{
              position: "absolute",
              bottom: "var(--space-3)",
              right: "var(--space-3)",
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.7rem",
              background: "rgba(27, 42, 74, 0.6)",
              color: "#fff",
            }}
          >
            ⊞ {venue.photoCount}
          </span>
        )}
      </div>

      <div style={{ padding: "var(--space-5)" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem" }}>{venue.name}</div>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "var(--space-1) 0 var(--space-4)" }}>
          {venue.district ?? "—"}
          {venue.category ? ` · ${VENUE_CATEGORY_LABEL[venue.category].toLowerCase()}` : ""}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid var(--color-border)",
            paddingTop: "var(--space-3)",
            fontSize: "0.8rem",
          }}
        >
          <Stat label="Capacity" value={venue.maxCapacity ? `to ${venue.maxCapacity}` : "TBD"} />
          <Stat label="Type" value={venue.category ? VENUE_CATEGORY_LABEL[venue.category] : "—"} />
          <Stat label="Layouts" value={String(venue.layoutCount)} />
        </div>

        <div style={{ marginTop: "var(--space-4)", color: "var(--color-accent)", fontSize: "0.75rem", fontWeight: 600 }}>
          View venue page ↗
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--color-text-muted)", fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", marginTop: "2px" }}>{value}</div>
    </div>
  );
}
