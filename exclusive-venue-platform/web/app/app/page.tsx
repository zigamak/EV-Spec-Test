"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  ENQUIRY_STAGES,
  STAGE_LABEL,
  type Brief,
  type EnquiryStage,
  type EnquiryWithBriefs,
} from "@/lib/api/types";
import { avatarColorForId, daysSince } from "@/lib/utils";
import NewEnquiryModal from "./NewEnquiryModal";

interface BoardCard {
  enquiry: EnquiryWithBriefs;
  brief: Brief | null;
}

const pillStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border)",
  background: "var(--color-bg)",
  color: "var(--color-text-secondary)",
  fontSize: "0.85rem",
};

/** Pipeline Board (task H2) — the dashboard home, no separate overview page
 * (route-architecture.md). Kanban columns by stage; each card surfaces the
 * fields a salesperson needs at a glance (event type/guests/date/budget)
 * pulled from the enquiry's latest brief, not just a bare stage/name list.
 * "lost" enquiries are collapsed out of the main board. Visual direction
 * reworked 16 Jul toward client-shared reference screenshots. */
export default function PipelineBoardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const enquiries = await apiFetch<EnquiryWithBriefs[]>("/enquiries");
      const withBriefs = enquiries.map((enquiry) => ({
        enquiry,
        brief: [...enquiry.briefs].sort((a, b) => b.version - a.version)[0] ?? null,
      }));
      setCards(withBriefs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pipeline");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowNewEnquiry(true);
      router.replace("/app");
    }
  }, [searchParams, router]);

  const columns: EnquiryStage[] = ENQUIRY_STAGES;

  const visibleCards = useMemo(() => {
    if (!cards) return [];
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.brief?.event_type?.toLowerCase().includes(q) ||
        c.enquiry.channel.toLowerCase().includes(q),
    );
  }, [cards, search]);

  const activeCards = useMemo(() => visibleCards.filter((c) => c.enquiry.stage !== "lost"), [visibleCards]);
  const pipelineValue = useMemo(
    () => activeCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0),
    [activeCards],
  );

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
            Pipeline
          </h1>
          {cards !== null && (
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
              {activeCards.length} active enquiries · HKD {pipelineValue.toLocaleString()} pipeline value
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...pillStyle, width: "200px" }}
          />
          <button style={{ ...pillStyle, cursor: "pointer" }}>Filter</button>
          <button
            onClick={() => setShowNewEnquiry(true)}
            style={{
              padding: "var(--space-2) var(--space-5)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + New Enquiry
          </button>
        </div>
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
            gap: "var(--space-5)",
            marginTop: "var(--space-8)",
            overflowX: "auto",
            paddingBottom: "var(--space-4)",
          }}
        >
          {columns.map((stage) => {
            const stageCards = activeCards.filter((c) => c.enquiry.stage === stage);
            const stageValue = stageCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0);
            return (
              <div key={stage} style={{ minWidth: "280px", flex: "0 0 280px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <h2 style={{ fontSize: "1rem", margin: 0, color: "var(--color-text-primary)" }}>
                    {STAGE_LABEL[stage]}
                  </h2>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: "1px solid var(--color-border)",
                      fontSize: "0.75rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {stageCards.length}
                  </span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "var(--space-1) 0 var(--space-4)" }}>
                  HKD {stageValue.toLocaleString()}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {stageCards.map(({ enquiry, brief }) => (
                    <Link
                      key={enquiry.id}
                      href={`/app/enquiries/${enquiry.id}`}
                      style={{
                        display: "block",
                        padding: "var(--space-4)",
                        background: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-lg)",
                        color: "var(--color-text-primary)",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 600 }}>{brief?.event_type ?? "Untitled enquiry"}</div>
                        {enquiry.assigned_to && (
                          <span
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "50%",
                              background: avatarColorForId(enquiry.assigned_to),
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {enquiry.assigned_to.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <span
                        style={{
                          display: "inline-block",
                          marginTop: "var(--space-2)",
                          padding: "2px var(--space-2)",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--color-surface)",
                          fontSize: "0.75rem",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {enquiry.channel}
                      </span>

                      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        {brief?.guest_count && <span>👥 {brief.guest_count}</span>}
                        {brief?.event_date && <span>📅 {brief.event_date}</span>}
                      </div>

                      {brief?.budget_amount && (
                        <div style={{ marginTop: "var(--space-2)", fontWeight: 600 }}>
                          HKD {brief.budget_amount.toLocaleString()}
                          {brief.budget_basis === "per_head" ? " / head" : ""}
                        </div>
                      )}

                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                        {daysSince(enquiry.updated_at)} day{daysSince(enquiry.updated_at) === 1 ? "" : "s"} in stage
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
