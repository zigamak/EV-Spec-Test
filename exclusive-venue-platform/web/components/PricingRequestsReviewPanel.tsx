"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { PricingRuleChangeRequest } from "@/lib/api/types";

/**
 * Staff review queue for landlord pricing requests (task D5), one venue
 * at a time — added to the existing Venue edit page, not a new route.
 * Approve creates a new versioned pricing_rules row server-side
 * (app/routers/pricing_rule_change_requests.py); this panel just shows
 * the request and triggers it.
 */
export default function PricingRequestsReviewPanel({ venueId }: { venueId: string }) {
  const [requests, setRequests] = useState<PricingRuleChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  function load() {
    apiFetch<PricingRuleChangeRequest[]>(`/venues/${venueId}/pricing-requests`)
      .then(setRequests)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load requests"));
  }

  useEffect(load, [venueId]);

  async function handleReview(requestId: string, action: "approve" | "reject") {
    setActingOn(requestId);
    try {
      await apiFetch(`/venues/${venueId}/pricing-requests/${requestId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setActingOn(null);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!requests) return <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>Loading…</p>;

  const pending = requests.filter((r) => r.status === "pending");

  if (pending.length === 0) {
    return <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>No pending requests.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {pending.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-3)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: "0.9rem" }}>
            {r.payload.currency} {r.payload.base_rate.toLocaleString()} base rate — effective{" "}
            {r.payload.effective_from}
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              disabled={actingOn === r.id}
              onClick={() => handleReview(r.id, "approve")}
              style={{
                padding: "var(--space-1) var(--space-3)",
                background: "var(--color-navy)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={actingOn === r.id}
              onClick={() => handleReview(r.id, "reject")}
              style={{
                padding: "var(--space-1) var(--space-3)",
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
