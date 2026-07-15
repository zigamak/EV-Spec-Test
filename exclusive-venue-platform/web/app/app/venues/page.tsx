"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Venue, VenueStatus } from "@/lib/api/types";

const STATUS_LABEL: Record<VenueStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  inactive: "Inactive",
};

const STATUS_COLOR: Record<VenueStatus, string> = {
  draft: "var(--color-text-muted)",
  pending_approval: "var(--color-warning)",
  active: "var(--color-success)",
  inactive: "var(--color-danger)",
};

/** Venue Library — list/search/filter (task B3). */
export default function VenueLibraryPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VenueStatus | "">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setVenues(null);

    const query = statusFilter ? `?status_filter=${statusFilter}` : "";
    apiFetch<Venue[]>(`/venues${query}`)
      .then((data) => {
        if (!cancelled) setVenues(data);
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
    <main style={{ padding: "var(--space-8)", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Venue Library</h1>
        <Link
          href="/app/venues/new"
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
          }}
        >
          + New venue
        </Link>
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", margin: "var(--space-6) 0" }}>
        <input
          placeholder="Search name, district, slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "var(--space-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VenueStatus | "")}
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
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

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {!error && venues === null && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
      {venues !== null && filtered.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>No venues found.</p>
      )}

      {filtered.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "var(--space-2)" }}>Name</th>
              <th style={{ padding: "var(--space-2)" }}>District</th>
              <th style={{ padding: "var(--space-2)" }}>Status</th>
              <th style={{ padding: "var(--space-2)" }}>Managed by</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((venue) => (
              <tr key={venue.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "var(--space-2)" }}>
                  <Link href={`/app/venues/${venue.id}`} style={{ color: "var(--color-accent)" }}>
                    {venue.name}
                  </Link>
                </td>
                <td style={{ padding: "var(--space-2)" }}>{venue.district ?? "—"}</td>
                <td style={{ padding: "var(--space-2)", color: STATUS_COLOR[venue.status] }}>
                  {STATUS_LABEL[venue.status]}
                </td>
                <td style={{ padding: "var(--space-2)" }}>
                  {venue.landlord_id ? "Landlord" : "Exclusive Venue"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
