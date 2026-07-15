"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Contact, Enquiry, Organisation } from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "0.85rem",
  color: "var(--color-text-secondary)",
};

/** Staff manual-entry form (task C3) — a modal from the Pipeline Board,
 * not a full route, so quick-entry stays fast. Optionally creates an
 * organisation + contact before the enquiry itself. */
export default function NewEnquiryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let organisationId: string | undefined;
      if (organisationName.trim()) {
        const org = await apiFetch<Organisation>("/organisations", {
          method: "POST",
          body: JSON.stringify({ name: organisationName.trim() }),
        });
        organisationId = org.id;
      }

      let contactId: string | undefined;
      if (fullName.trim()) {
        const contact = await apiFetch<Contact>("/contacts", {
          method: "POST",
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            organisation_id: organisationId ?? null,
            source: "manual",
          }),
        });
        contactId = contact.id;
      }

      const enquiry = await apiFetch<Enquiry>("/enquiries", {
        method: "POST",
        body: JSON.stringify({
          contact_id: contactId ?? null,
          channel: "manual",
          raw_content: rawContent.trim(),
        }),
      });

      if (enquiry) onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create enquiry");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          width: "min(560px, 90vw)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0 }}>New enquiry</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <label style={labelStyle} htmlFor="full-name">
              Contact name
            </label>
            <input id="full-name" style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="email">
                Email
              </label>
              <input id="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="phone">
                Phone
              </label>
              <input id="phone" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="organisation">
              Organisation (optional)
            </label>
            <input
              id="organisation"
              style={inputStyle}
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="raw-content">
              Enquiry details
            </label>
            <textarea
              id="raw-content"
              style={{ ...inputStyle, minHeight: "140px", resize: "vertical" }}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="Paste or type the raw enquiry — date, guests, budget, event type, requirements…"
              required
            />
          </div>

          {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-bg)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Creating…" : "Create enquiry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
