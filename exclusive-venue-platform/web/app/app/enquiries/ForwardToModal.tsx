"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { avatarColorForId } from "@/lib/utils";
import { fetchStaff, StaffMember, TEAM, TEAM_META, WHOLE_TEAM } from "@/lib/team";

/** "Forward to" hand-off (task H5) — routes an enquiry to a real staff member
 * (fetched live from GET /staff) and records an optional note. Writes
 * enquiries.assigned_to (the real auth.users id), forwarded_to (display name,
 * kept for the pipeline owner filter) + forward_note via PATCH. */

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ForwardToModal({
  enquiryId,
  headline,
  subtitle,
  current,
  onClose,
  onForwarded,
}: {
  enquiryId: string;
  headline: string;
  subtitle: string;
  current: string | null;
  onClose: () => void;
  onForwarded: (name: string, note: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(current);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);

  // Load the live operator directory; fall back to the static names if the
  // call fails so the hand-off is never blocked.
  useEffect(() => {
    let active = true;
    fetchStaff()
      .then((rows) => active && setStaff(rows))
      .catch(() => active && setStaff(null));
    return () => {
      active = false;
    };
  }, []);

  const directory: { name: string; id: string | null }[] =
    staff && staff.length > 0
      ? staff.map((s) => ({ name: s.full_name, id: s.id }))
      : TEAM.map((m) => ({ name: m.name, id: null }));

  const options = [
    ...directory.map((m) => ({
      name: m.name,
      id: m.id,
      role: TEAM_META[m.name]?.role ?? "Staff",
      region: TEAM_META[m.name]?.region ?? "",
      whole: false,
    })),
    {
      name: WHOLE_TEAM,
      id: null,
      role: `${directory.map((m) => m.name.split(" ")[0]).join(", ")} — all notified`,
      region: "",
      whole: true,
    },
  ];

  async function forward() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      // Assign to the real staff account when we have its id (single person,
      // live directory). "The whole team" and the static fallback have no id,
      // so only the display name is written.
      const chosen = options.find((o) => o.name === selected);
      const body: Record<string, unknown> = {
        forwarded_to: selected,
        forward_note: note || null,
      };
      if (chosen?.id) body.assigned_to = chosen.id;
      await apiFetch(`/enquiries/${enquiryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onForwarded(selected, note);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't forward this enquiry.");
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
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "var(--space-8)",
        }}
      >
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2rem", margin: 0 }}>
          Send to <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>the right hands</span>
        </h2>
        <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-2) 0 var(--space-6)", fontSize: "0.9rem" }}>
          <strong>{headline}</strong>
          {subtitle ? ` · ${subtitle}` : ""}
        </p>

        <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "var(--space-3)" }}>
          Forward to
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {options.map((o) => {
            const active = selected === o.name;
            return (
              <button
                key={o.name}
                onClick={() => setSelected(o.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  textAlign: "left",
                  padding: "var(--space-4)",
                  background: active ? "var(--color-surface)" : "var(--color-bg)",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: o.whole ? "transparent" : avatarColorForId(o.name),
                    border: o.whole ? "1px solid var(--color-border)" : "none",
                    color: o.whole ? "var(--color-text-secondary)" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: o.whole ? "0.65rem" : "0.85rem",
                    fontWeight: 700,
                    letterSpacing: o.whole ? "0.05em" : 0,
                  }}
                >
                  {o.whole ? "ALL" : initials(o.name)}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem" }}>
                    {o.whole ? (
                      <>
                        The <span style={{ fontStyle: "italic" }}>whole team</span>
                      </>
                    ) : (
                      (() => {
                        const [first, ...rest] = o.name.split(" ");
                        return (
                          <>
                            {first} <span style={{ fontStyle: "italic" }}>{rest.join(" ")}</span>
                          </>
                        );
                      })()
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    {o.role}
                    {o.region ? ` · ${o.region}` : ""}
                  </span>
                </span>
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: active ? "var(--color-accent)" : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: 600, margin: "var(--space-6) 0 var(--space-2)" }}>
          Add a note <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic", color: "var(--color-text-muted)", fontWeight: 400 }}>optional</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A line of context for them — why this lands on their desk…"
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
          The note becomes part of the client timeline.
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
            onClick={forward}
            disabled={!selected || submitting}
            style={{
              padding: "var(--space-3) var(--space-5)",
              border: "1px solid var(--color-accent)",
              background: selected ? "var(--color-accent)" : "var(--color-surface)",
              color: selected ? "#fff" : "var(--color-text-muted)",
              fontSize: "0.68rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: selected && !submitting ? "pointer" : "default",
            }}
          >
            {submitting ? "Forwarding…" : "Forward →"}
          </button>
        </div>
      </div>
    </div>
  );
}
