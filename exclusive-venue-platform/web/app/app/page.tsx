"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  ENQUIRY_STAGES,
  STAGE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  type Brief,
  type Contact,
  type EnquiryStage,
  type EnquiryStatus,
  type EnquiryWithBriefs,
  type Organisation,
} from "@/lib/api/types";
import { avatarColorForId, daysSince } from "@/lib/utils";
import { TEAM } from "@/lib/team";
import NewEnquiryModal from "./NewEnquiryModal";

interface BoardCard {
  enquiry: EnquiryWithBriefs;
  brief: Brief | null;
  brand: string;
  owner: string | null;
}

const pillStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border)",
  background: "var(--color-bg)",
  color: "var(--color-text-secondary)",
  fontSize: "0.85rem",
};

const STAGE_SUBTITLE: Record<EnquiryStage, string> = {
  enquiry: "Brief received",
  briefed: "AI processed",
  proposed: "Sent to client",
  held: "Soft-hold placed",
  signed: "Contract done",
  lost: "",
};

// Per-stage accent (column top border + card left border), matching the
// reference's grey → brass → gold → burgundy → green progression.
const STAGE_ACCENT: Record<EnquiryStage, string> = {
  enquiry: "#8a8f99",
  briefed: "var(--color-brass)",
  proposed: "#c9a24a",
  held: "var(--color-accent)",
  signed: "var(--color-success)",
  lost: "var(--color-text-muted)",
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `HK$ ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `HK$ ${Math.round(n / 1000)}k`;
  return `HK$ ${n.toLocaleString()}`;
}

/** Pipeline Board (task H2) — Kanban by stage over enquiries + their latest
 * brief, reworked toward the "Pipeline · deals" reference: owner filter
 * (the forward-to owner), per-column value totals, and cards showing brand,
 * value, owner, and urgency. "lost" is collapsed out of the board. Stage
 * transitions (proposed → held/signed) are handled elsewhere (task H1). */
export default function PipelineBoardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [enquiries, contacts, orgs] = await Promise.all([
        apiFetch<EnquiryWithBriefs[]>("/enquiries"),
        apiFetch<Contact[]>("/contacts"),
        apiFetch<Organisation[]>("/organisations"),
      ]);
      const contactsById = new Map(contacts.map((c) => [c.id, c]));
      const orgsById = new Map(orgs.map((o) => [o.id, o]));
      const built = enquiries.map((enquiry) => {
        const brief = [...enquiry.briefs].sort((a, b) => b.version - a.version)[0] ?? null;
        const contact = enquiry.contact_id ? contactsById.get(enquiry.contact_id) ?? null : null;
        const org = contact?.organisation_id ? orgsById.get(contact.organisation_id) ?? null : null;
        const brand = org?.name ?? contact?.full_name ?? brief?.event_type ?? "Untitled";
        return { enquiry, brief, brand, owner: enquiry.forwarded_to };
      });
      setCards(built);
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

  const visibleCards = useMemo(() => {
    let list = cards ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.brand.toLowerCase().includes(q) || c.brief?.event_type?.toLowerCase().includes(q),
      );
    }
    if (ownerFilter) list = list.filter((c) => c.owner === ownerFilter);
    return list;
  }, [cards, search, ownerFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<EnquiryStatus, number> = { open: 0, awaiting: 0, won: 0, lost: 0 };
    for (const c of visibleCards) counts[c.enquiry.status]++;
    return counts;
  }, [visibleCards]);

  const statusFilteredCards = useMemo(
    () => (statusFilter ? visibleCards.filter((c) => c.enquiry.status === statusFilter) : visibleCards),
    [visibleCards, statusFilter],
  );

  const activeCards = useMemo(
    () => statusFilteredCards.filter((c) => c.enquiry.stage !== "lost"),
    [statusFilteredCards],
  );
  const pipelineValue = useMemo(
    () => activeCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0),
    [activeCards],
  );
  const managerCount = useMemo(
    () => new Set(activeCards.map((c) => c.owner).filter(Boolean)).size,
    [activeCards],
  );

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
            Pipeline · <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>deals</span>
          </h1>
          {cards !== null && (
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
              {activeCards.length} active deals · {fmtMoney(pipelineValue)} total
              {managerCount > 0 ? ` · piloted by ${managerCount} account manager${managerCount === 1 ? "" : "s"}` : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...pillStyle, width: "180px" }}
          />
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

      {/* Owner filter */}
      {cards !== null && (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-5)", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)", marginRight: "var(--space-2)" }}>
            Owner
          </span>
          {[null, ...TEAM.map((m) => m.name)].map((name) => {
            const active = ownerFilter === name;
            const label = name ? name.split(" ")[0] : "All";
            return (
              <button
                key={name ?? "all"}
                onClick={() => setOwnerFilter(name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "var(--space-2) var(--space-4)",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--color-navy)" : "var(--color-border)"}`,
                  background: active ? "var(--color-surface)" : "var(--color-bg)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: active ? 700 : 400,
                }}
              >
                {name && (
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: avatarColorForId(name) }} />
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Status rollup pills */}
      {cards !== null && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          {(["open", "awaiting", "won", "lost"] as EnquiryStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((current) => (current === s ? null : s))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-pill)",
                border: statusFilter === s ? `1px solid ${STATUS_COLOR[s]}` : "1px solid var(--color-border)",
                background: statusFilter === s ? "var(--color-surface)" : "var(--color-bg)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLOR[s], display: "inline-block" }} />
              <span style={{ color: "var(--color-text-primary)", fontWeight: statusFilter === s ? 700 : 400 }}>{STATUS_LABEL[s]}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>{statusCounts[s]}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>}
      {!error && cards === null && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>Loading…</p>
      )}

      {/* Lost: flat list, no column */}
      {cards !== null && statusFilter === "lost" && (
        <div style={{ marginTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: "480px" }}>
          {statusFilteredCards.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No lost enquiries.</p>}
          {statusFilteredCards.map(({ enquiry, brand }) => (
            <Link key={enquiry.id} href={`/app/enquiries/${enquiry.id}`} style={{ display: "block", padding: "var(--space-4)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", color: "var(--color-text-primary)", textDecoration: "none" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>{brand}</div>
              {enquiry.lost_reason && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>{enquiry.lost_reason}</div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Kanban */}
      {cards !== null && statusFilter !== "lost" && (
        <div style={{ display: "flex", gap: "var(--space-5)", marginTop: "var(--space-8)", overflowX: "auto", paddingBottom: "var(--space-4)" }}>
          {ENQUIRY_STAGES.map((stage) => {
            const stageCards = activeCards.filter((c) => c.enquiry.stage === stage);
            const stageValue = stageCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0);
            return (
              <div key={stage} style={{ minWidth: "280px", flex: "0 0 280px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `3px solid ${STAGE_ACCENT[stage]}`, paddingTop: "var(--space-3)" }}>
                  <span style={{ fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                    {STAGE_LABEL[stage]}
                  </span>
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--color-text-muted)" }}>{stageCards.length}</span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", margin: "var(--space-1) 0 var(--space-4)" }}>
                  {fmtMoney(stageValue)} · {STAGE_SUBTITLE[stage]}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {stageCards.map(({ enquiry, brief, brand, owner }) => {
                    const days = daysSince(enquiry.updated_at);
                    const idle = days >= 2;
                    return (
                      <Link
                        key={enquiry.id}
                        href={`/app/enquiries/${enquiry.id}`}
                        style={{
                          display: "block",
                          padding: "var(--space-4)",
                          background: "var(--color-bg)",
                          borderLeft: `3px solid ${STAGE_ACCENT[enquiry.stage]}`,
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          color: "var(--color-text-primary)",
                          textDecoration: "none",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 7px",
                            borderRadius: "2px",
                            fontSize: "0.58rem",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            background: idle ? "var(--color-accent)" : "var(--color-brass)",
                            color: "#fff",
                          }}
                        >
                          {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}${idle ? " idle" : ""}`}
                        </span>

                        <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", marginTop: "var(--space-2)" }}>{brand}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                          {brief?.event_type ?? "—"}
                          {brief?.guest_count ? ` · ${brief.guest_count} pax` : ""}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-3)" }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                            {brief?.budget_amount ? fmtMoney(brief.budget_amount) : "—"}
                          </span>
                          {owner && (
                            <span style={{ fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: avatarColorForId(owner) }}>
                              {owner.split(" ")[0]}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {stageCards.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>—</p>}
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
