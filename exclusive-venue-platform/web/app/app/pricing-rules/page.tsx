"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import PricingRulesTab from "@/components/PricingRulesTab";
import { VENUE_CATEGORY_LABEL, type Venue } from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-pill)",
  font: "inherit",
  fontSize: "0.85rem",
  width: "100%",
};

/** Pricing rules directory (Inventory nav) — picks a venue, then reuses the
 * same rule/add-on/quote-tester UI that lives inline on the Venue edit page.
 * Rules are always venue-scoped (no cross-venue table), so this is a picker
 * + the existing editor, not a new data model. */
export default function PricingRulesDirectoryPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Venue[]>("/venues")
      .then((data) => {
        if (cancelled) return;
        setVenues(data);
        if (data.length > 0) setSelectedId((prev) => prev ?? data[0]!.id);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load venues");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = venues ?? [];
    if (!q) return list;
    return list.filter(
      (v) => v.name.toLowerCase().includes(q) || v.district?.toLowerCase().includes(q),
    );
  }, [venues, search]);

  const selected = (venues ?? []).find((v) => v.id === selectedId) ?? null;

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: "320px", flexShrink: 0, borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "var(--space-6) var(--space-6) var(--space-4)" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.5rem" }}>
            Pricing <em style={{ color: "var(--color-accent)" }}>rules</em>
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "var(--space-2) 0 var(--space-4)" }}>
            Base rates, per-head tiers, day surcharges and add-ons, by venue.
          </p>
          <input
            placeholder="Search venues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 var(--space-4) var(--space-6)" }}>
          {venues === null && (
            <div style={{ padding: "0 var(--space-2)" }}>
              <PageLoader label="Loading venues" />
            </div>
          )}
          {venues !== null && filtered.length === 0 && (
            <p style={{ padding: "0 var(--space-2)", color: "var(--color-text-muted)" }}>No matches.</p>
          )}
          {filtered.map((v) => {
            const active = v.id === selectedId;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "var(--space-3) var(--space-2)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: active ? "var(--color-surface)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1rem" }}>{v.name}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {[v.category ? VENUE_CATEGORY_LABEL[v.category] : null, v.district].filter(Boolean).join(" · ") || "—"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-8)" }}>
        {selected ? (
          <>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.8rem" }}>
              {selected.name}
            </h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-2) 0 var(--space-6)" }}>
              {[selected.category ? VENUE_CATEGORY_LABEL[selected.category] : null, selected.district].filter(Boolean).join(" · ") || "—"}
            </p>
            <PricingRulesTab key={selected.id} venueId={selected.id} />
          </>
        ) : venues !== null ? (
          <p style={{ color: "var(--color-text-muted)" }}>Select a venue to manage its pricing rules.</p>
        ) : null}
      </div>
    </main>
  );
}
