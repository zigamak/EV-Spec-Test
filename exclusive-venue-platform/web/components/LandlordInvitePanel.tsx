"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { LandlordInvite } from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
};

/**
 * "Invite landlord" action on the staff Venue Profile (task B3). Sends a
 * Supabase Auth invite (POST /landlord-invites, app/routers/
 * landlord_invites.py) — this venue's landlord_id isn't set by this form
 * directly; per prd.md §4 Path A, staff links the invite to this venue
 * once accepted (a follow-up "assign existing landlord" step, not built
 * here — this component covers sending the invite itself).
 */
export default function LandlordInvitePanel() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<LandlordInvite[]>([]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const invite = await apiFetch<LandlordInvite>("/landlord-invites", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSentInvites((prev) => [invite, ...prev]);
      setEmail("");
      setMessage(`Invite sent to ${invite.email}.`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleInvite} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Landlord email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !email}
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-navy)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Sending…" : "Invite landlord"}
        </button>
      </form>
      {message && <p style={{ fontSize: "0.85rem", marginTop: "var(--space-2)" }}>{message}</p>}
      {sentInvites.length > 0 && (
        <ul style={{ marginTop: "var(--space-3)", paddingLeft: "var(--space-5)", fontSize: "0.85rem" }}>
          {sentInvites.map((i) => (
            <li key={i.id}>
              {i.email} — {i.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
