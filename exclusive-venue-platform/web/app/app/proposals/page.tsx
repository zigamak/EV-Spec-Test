"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Proposal, ProposalStatus } from "@/lib/api/types";
import PageLoader from "@/components/PageLoader";

/** Proposals index (task G8) — every proposal, newest first, filterable by
 * status. Each row opens the proposal editor (/app/proposals/[id]). The
 * title already carries the client + event (set at build time), so no extra
 * per-row joins are needed here. */

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

const STATUS_STYLE: Record<ProposalStatus, React.CSSProperties> = {
  draft: { background: "var(--color-surface)", color: "var(--color-text-secondary)" },
  pending_approval: { background: "#fdf1e0", color: "var(--color-warning)" },
  sent: { background: "var(--color-navy)", color: "#fff" },
  viewed: { background: "#e7eef7", color: "#2f6fb0" },
  accepted: { background: "#e7efe7", color: "#2f7a44" },
  declined: { background: "#fbe4e6", color: "var(--color-danger)" },
};

const FILTERS: (ProposalStatus | "all")[] = ["all", "draft", "sent", "accepted", "declined"];

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    apiFetch<Proposal[]>("/proposals")
      .then((data) => !cancelled && setProposals(data))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load proposals");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (proposals ?? []).filter((p) => filter === "all" || p.status === filter),
    [proposals, filter],
  );

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
        Proposals
      </h1>
      {proposals !== null && (
        <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
          {proposals.length} total
        </p>
      )}

      {/* Status tabs */}
      <div style={{ display: "flex", gap: "var(--space-5)", borderBottom: "1px solid var(--color-border)", marginTop: "var(--space-6)" }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          const count = f === "all" ? proposals?.length ?? 0 : (proposals ?? []).filter((p) => p.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: "none",
                border: "none",
                borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                padding: "0 0 var(--space-3)",
                marginBottom: "-1px",
                cursor: "pointer",
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
              }}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]}{" "}
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "0.9rem" }}>{count}</span>
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>}
      {!error && proposals === null && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <PageLoader label="Loading proposals" />
        </div>
      )}
      {proposals !== null && visible.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>
          No {filter === "all" ? "" : STATUS_LABEL[filter].toLowerCase()} proposals yet. Build one from an enquiry.
        </p>
      )}

      {visible.length > 0 && (
        <div style={{ marginTop: "var(--space-6)", border: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
          {visible.map((p, i) => (
            <Link
              key={p.id}
              href={`/app/proposals/new?proposal=${p.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                padding: "var(--space-4) var(--space-6)",
                borderTop: i === 0 ? "none" : "1px solid var(--color-border)",
                textDecoration: "none",
                color: "var(--color-text-primary)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.title}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  #{p.id.slice(0, 4).toUpperCase()} · v{p.version} · {p.origin} · {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  padding: "3px 10px",
                  borderRadius: "2px",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  ...STATUS_STYLE[p.status],
                }}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
