"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type {
  PricingRule,
  PricingRuleChangeRequest,
  Venue,
  VenueConfiguration,
  VenueRestriction,
  VenueUpdate,
} from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  width: "100%",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
  marginBottom: "var(--space-5)",
};

const REQUEST_STATUS_LABEL: Record<PricingRuleChangeRequest["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * Landlord venue detail/edit (task E3) + pricing tab (task D4). Every
 * field here uses Product 1's existing venue CRUD endpoints as-is — RLS
 * (venues_landlord_update_own, {table}_landlord_all_own from migrations
 * 0002/0005) already scopes them correctly to this landlord's own venue,
 * so no new API surface was needed for the venue-details half of this
 * page. The pricing section is the one genuinely new piece (task D-group):
 * view the live rule read-only, propose a change instead of writing it.
 *
 * Media gallery and the availability calendar are deliberately NOT built
 * here yet — noted as a follow-up in tasks.md rather than silently
 * shipped incomplete; this page covers details/restrictions/
 * configurations/pricing, the highest-value slice for v1.
 */
export default function LandlordVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<Venue | null>(null);
  const [configurations, setConfigurations] = useState<VenueConfiguration[]>([]);
  const [restrictions, setRestrictions] = useState<VenueRestriction[]>([]);
  const [activeRule, setActiveRule] = useState<PricingRule | null>(null);
  const [requests, setRequests] = useState<PricingRuleChangeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<VenueUpdate | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [proposedRate, setProposedRate] = useState("");
  const [proposedCurrency, setProposedCurrency] = useState("HKD");
  const [proposedEffectiveFrom, setProposedEffectiveFrom] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  function load() {
    setError(null);
    apiFetch<Venue>(`/venues/${venueId}`)
      .then((v) => {
        setVenue(v);
        setForm({
          name: v.name,
          description: v.description,
          address: v.address,
          district: v.district,
          amenities: v.amenities,
        });
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load venue"));

    apiFetch<VenueConfiguration[]>(`/venues/${venueId}/configurations`).then(setConfigurations).catch(() => {});
    apiFetch<VenueRestriction[]>(`/venues/${venueId}/restrictions`).then(setRestrictions).catch(() => {});
    apiFetch<PricingRuleChangeRequest[]>(`/venues/${venueId}/pricing-requests`)
      .then(setRequests)
      .catch(() => {});

    const today = new Date().toISOString().slice(0, 10);
    apiFetch<PricingRule>(`/venues/${venueId}/pricing-rules/active?on_date=${today}`)
      .then(setActiveRule)
      .catch(() => setActiveRule(null)); // 404 = no active rule yet, not an error worth surfacing
  }

  useEffect(load, [venueId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await apiFetch<Venue>(`/venues/${venueId}`, { method: "PATCH", body: JSON.stringify(form) });
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleProposePricing(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingRequest(true);
    setRequestError(null);
    try {
      await apiFetch(`/venues/${venueId}/pricing-requests`, {
        method: "POST",
        body: JSON.stringify({
          payload: {
            currency: proposedCurrency,
            base_rate: Number(proposedRate),
            effective_from: proposedEffectiveFrom,
          },
        }),
      });
      setProposedRate("");
      setProposedEffectiveFrom("");
      load();
    } catch (err) {
      setRequestError(err instanceof ApiError ? err.message : "Failed to submit request");
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)", padding: "var(--space-6)" }}>{error}</p>;
  if (!venue || !form) return <PageLoader label="Loading venue" />;

  const pendingRequest = requests.find((r) => r.status === "pending");

  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-6)" }}>
        {venue.name}
      </h1>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Details</h2>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Name</span>
            <input
              style={inputStyle}
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Description</span>
            <textarea
              style={{ ...inputStyle, minHeight: "80px" }}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Address</span>
            <input
              style={inputStyle}
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>District</span>
            <input
              style={inputStyle}
              value={form.district ?? ""}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--color-navy)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saveMessage && <span style={{ marginLeft: "var(--space-3)", fontSize: "0.85rem" }}>{saveMessage}</span>}
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Configurations</h2>
        {configurations.length === 0 && (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>None added yet.</p>
        )}
        {configurations.map((c) => (
          <div key={c.id} style={{ fontSize: "0.9rem", padding: "var(--space-1) 0" }}>
            {c.name} — {c.capacity} guests
          </div>
        ))}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Restrictions</h2>
        {restrictions.length === 0 && (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>None added yet.</p>
        )}
        {restrictions.map((r) => (
          <div key={r.id} style={{ fontSize: "0.9rem", padding: "var(--space-1) 0" }}>
            {r.kind}
            {r.value ? ` — ${r.value}` : ""} {r.hard ? "(hard)" : "(soft)"}
          </div>
        ))}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Pricing</h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
          Read-only — pricing changes go through staff review before they take effect.
        </p>

        {activeRule ? (
          <div style={{ fontSize: "0.9rem", marginBottom: "var(--space-4)" }}>
            Current: {activeRule.currency} {activeRule.base_rate.toLocaleString()} base rate
            (effective {activeRule.effective_from})
          </div>
        ) : (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>No active pricing rule yet.</p>
        )}

        {requests.length > 0 && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 600 }}>Your requests</h3>
            {requests.map((r) => (
              <div key={r.id} style={{ fontSize: "0.85rem", padding: "var(--space-1) 0" }}>
                {r.payload.currency} {r.payload.base_rate.toLocaleString()} — {REQUEST_STATUS_LABEL[r.status]}
              </div>
            ))}
          </div>
        )}

        {!pendingRequest && (
          <form onSubmit={handleProposePricing} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "0.8rem" }}>Currency</span>
              <input
                style={{ ...inputStyle, width: "80px" }}
                value={proposedCurrency}
                onChange={(e) => setProposedCurrency(e.target.value.toUpperCase())}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "0.8rem" }}>Base rate</span>
              <input
                type="number"
                min={0}
                required
                style={{ ...inputStyle, width: "140px" }}
                value={proposedRate}
                onChange={(e) => setProposedRate(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "0.8rem" }}>Effective from</span>
              <input
                type="date"
                required
                style={{ ...inputStyle, width: "160px" }}
                value={proposedEffectiveFrom}
                onChange={(e) => setProposedEffectiveFrom(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={submittingRequest}
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: submittingRequest ? "default" : "pointer",
              }}
            >
              {submittingRequest ? "Submitting…" : "Propose pricing"}
            </button>
          </form>
        )}
        {pendingRequest && (
          <p style={{ fontSize: "0.85rem", color: "var(--color-warning)" }}>
            A request is already pending staff review.
          </p>
        )}
        {requestError && <p style={{ color: "var(--color-danger)" }}>{requestError}</p>}
      </section>
    </main>
  );
}
