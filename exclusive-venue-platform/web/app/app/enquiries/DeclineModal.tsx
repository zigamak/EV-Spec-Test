"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";

const DECLINE_REASONS = [
  "Budget mismatch",
  "Date unavailable",
  "Went with another venue",
  "Unresponsive",
  "Other",
];

/** Decline/"mark lost" flow (workflow overhaul) — the one place an enquiry
 * gets moved to the terminal "lost" stage from anywhere in the app (the
 * Inquiries inbox, the Pipeline board's drag-to-lost, and the enquiry
 * command center), replacing three separate raw window.prompt() calls with
 * one consistent, reason-structured modal. Calls the existing, already-
 * validated POST /enquiries/{id}/transition — no new backend route needed;
 * the stage machine (api/app/services/stage_machine.py) still has final say. */
export default function DeclineModal({
  enquiryId,
  headline,
  subtitle,
  onClose,
  onDeclined,
}: {
  enquiryId: string;
  headline: string;
  subtitle?: string;
  onClose: () => void;
  onDeclined: (reason: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDetail = selected === "Other";
  const canSubmit = selected !== null && (!needsDetail || detail.trim().length > 0);
  const reason = needsDetail
    ? detail.trim()
    : detail.trim()
      ? `${selected} — ${detail.trim()}`
      : selected ?? "";

  async function decline() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/enquiries/${enquiryId}/transition`, {
        method: "POST",
        body: JSON.stringify({ stage: "lost", lost_reason: reason }),
      });
      onDeclined(reason);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't decline this enquiry.");
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(27,42,74,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "var(--space-6)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          width: "min(480px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "var(--space-8)",
        }}
      >
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2rem", margin: 0 }}>
          Decline <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>politely</span>
        </h2>
        <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-2) 0 var(--space-6)", fontSize: "0.9rem" }}>
          <strong>{headline}</strong>
          {subtitle ? ` · ${subtitle}` : ""}
        </p>

        <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "var(--space-3)" }}>
          Reason
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {DECLINE_REASONS.map((r) => {
            const active = selected === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                  background: active ? "var(--color-surface)" : "var(--color-bg)",
                  color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                  fontSize: "0.85rem",
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: 600, margin: "var(--space-6) 0 var(--space-2)" }}>
          {needsDetail ? "Detail" : "Add detail"}{" "}
          <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic", color: "var(--color-text-muted)", fontWeight: 400 }}>
            {needsDetail ? "required" : "optional"}
          </span>
        </div>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={needsDetail ? "What happened…" : "Any extra context for the record…"}
          rows={3}
          style={{
            width: "100%",
            padding: "var(--space-3)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            font: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
          This becomes the enquiry&apos;s lost reason and shows in the client timeline.
        </div>

        {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-3)" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={!canSubmit || submitting}
            style={{
              padding: "var(--space-3) var(--space-5)",
              border: "1px solid var(--color-danger)",
              background: canSubmit ? "var(--color-danger)" : "var(--color-surface)",
              color: canSubmit ? "#fff" : "var(--color-text-muted)",
              fontSize: "0.68rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: canSubmit && !submitting ? "pointer" : "default",
            }}
          >
            {submitting ? "Declining…" : "Decline enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}
