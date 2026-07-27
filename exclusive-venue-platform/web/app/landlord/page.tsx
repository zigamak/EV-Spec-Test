"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import PageLoader from "@/components/PageLoader";
import type { Venue, VenueCreate, VenueStatus } from "@/lib/api/types";

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * My Venues — the landlord dashboard (task E2). Flat list only, no
 * grouping/portfolio concept (confirmed not needed for v1, prd.md §5).
 * "Add venue" is Path B from prd.md §4: landlord_id is set to the
 * caller's own auth.uid() and status forced to 'pending_approval' —
 * venues_landlord_insert_own's RLS WITH CHECK enforces both server-side
 * regardless of what this form sends, but sending the right values here
 * avoids a pointless round-trip denial.
 */
export default function LandlordDashboardPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  function loadVenues() {
    setError(null);
    apiFetch<Venue[]>("/venues")
      .then(setVenues)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load venues"));
  }

  useEffect(loadVenues, []);

  async function handleAddVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setFormError(null);

    const body: VenueCreate = {
      name: newName,
      slug: `${slugify(newName)}-${Date.now().toString(36)}`,
      landlord_id: userId,
      status: "pending_approval",
    };

    try {
      await apiFetch<Venue>("/venues", { method: "POST", body: JSON.stringify(body) });
      setNewName("");
      setShowAddForm(false);
      loadVenues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create venue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: "960px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-6)",
        }}
      >
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", margin: 0 }}>
            My venues
          </h1>
          <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
            <Link href="/landlord/payouts" style={{ color: "var(--color-accent)" }}>
              Payout settings
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-pill)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Add venue
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddVenue}
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "flex-end",
            padding: "var(--space-4)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-6)",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Venue name</span>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                padding: "var(--space-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                font: "inherit",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !newName}
            style={{
              padding: "var(--space-2) var(--space-4)",
              background: "var(--color-navy)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
          {formError && <p style={{ color: "var(--color-danger)", margin: 0 }}>{formError}</p>}
        </form>
      )}

      <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", marginBottom: "var(--space-4)" }}>
        New venues start as <strong>Pending approval</strong> — staff review before it's visible to clients.
      </p>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {!venues && !error && <PageLoader label="Loading your venues" />}

      {venues && venues.length === 0 && (
        <p style={{ color: "var(--color-text-secondary)" }}>No venues yet — add one above.</p>
      )}

      {venues && venues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {venues.map((venue) => (
            <Link
              key={venue.id}
              href={`/landlord/venues/${venue.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-4)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{venue.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  {venue.district ?? "No district set"}
                </div>
              </div>
              <span
                style={{
                  ...STATUS_STYLE[venue.status],
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                {STATUS_LABEL[venue.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
