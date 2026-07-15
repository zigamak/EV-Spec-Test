"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  ENQUIRY_STAGES,
  STAGE_LABEL,
  type Brief,
  type Enquiry,
  type EnquiryStage,
} from "@/lib/api/types";
import NewEnquiryModal from "./NewEnquiryModal";

interface BoardCard {
  enquiry: Enquiry;
  brief: Brief | null;
}

/** Pipeline Board (task H2) — the dashboard home, no separate overview page
 * (route-architecture.md). Kanban columns by stage; each card surfaces the
 * fields a salesperson needs at a glance (event type/guests/date/budget)
 * pulled from the enquiry's latest brief, not just a bare stage/name list.
 * "lost" enquiries are collapsed out of the main board. */
export default function PipelineBoardPage() {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const enquiries = await apiFetch<Enquiry[]>("/enquiries");
      const withBriefs = await Promise.all(
        enquiries.map(async (enquiry) => {
          const briefs = await apiFetch<Brief[]>(`/enquiries/${enquiry.id}/briefs`).catch(
            () => [] as Brief[],
          );
          return { enquiry, brief: briefs[0] ?? null };
        }),
      );
      setCards(withBriefs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pipeline");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: EnquiryStage[] = ENQUIRY_STAGES;

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Pipeline Board</h1>
        <button
          onClick={() => setShowNewEnquiry(true)}
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          + New enquiry
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>
      )}
      {!error && cards === null && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>Loading…</p>
      )}

      {cards !== null && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            marginTop: "var(--space-6)",
            overflowX: "auto",
            paddingBottom: "var(--space-4)",
          }}
        >
          {columns.map((stage) => {
            const stageCards = cards.filter((c) => c.enquiry.stage === stage);
            return (
              <div key={stage} style={{ minWidth: "260px", flex: "0 0 260px" }}>
                <h2
                  style={{
                    fontSize: "0.9rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    color: "var(--color-text-secondary)",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  {STAGE_LABEL[stage]} ({stageCards.length})
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {stageCards.map(({ enquiry, brief }) => (
                    <Link
                      key={enquiry.id}
                      href={`/app/enquiries/${enquiry.id}`}
                      style={{
                        display: "block",
                        padding: "var(--space-3)",
                        background: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--color-text-primary)",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {brief?.event_type ?? "Untitled enquiry"}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                        {brief?.guest_count ? `${brief.guest_count} guests` : "Guests TBD"}
                        {brief?.event_date ? ` · ${brief.event_date}` : ""}
                      </div>
                      {brief?.budget_amount && (
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                          HK${brief.budget_amount.toLocaleString()}
                          {brief.budget_basis === "per_head" ? " / head" : ""}
                        </div>
                      )}
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                        {enquiry.channel}
                      </div>
                    </Link>
                  ))}
                  {stageCards.length === 0 && (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewEnquiry && (
        <NewEnquiryModal
          onClose={() => setShowNewEnquiry(false)}
          onCreated={() => {
            setShowNewEnquiry(false);
            load();
          }}
        />
      )}
    </main>
  );
}
