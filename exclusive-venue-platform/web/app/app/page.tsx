"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  ENQUIRY_STAGES,
  STAGE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  type Brief,
  type EnquiryStage,
  type EnquiryStatus,
  type EnquiryWithBriefs,
  type Proposal,
} from "@/lib/api/types";
import { daysSince, daysUntil } from "@/lib/utils";
import { OWNER_COLOR, WHOLE_TEAM, initialsFromName, useStaffDirectory } from "@/lib/team";
import { useMe } from "@/lib/useMe";
import NewEnquiryModal from "./NewEnquiryModal";
import DeclineModal from "./enquiries/DeclineModal";

interface BoardCard {
  enquiry: EnquiryWithBriefs;
  brief: Brief | null;
}

// Per-stage accent — reuses existing brand tokens only (no new hues), so a
// glance at the left rail of a card tells you its stage even mid-scroll.
// Ordered to read as a "temperature" that warms as a deal closes: neutral →
// brass (in motion) → navy (formal/proposed) → amber (pending decision) →
// success (won).
const STAGE_ACCENT: Record<EnquiryStage, string> = {
  enquiry: "var(--color-text-muted)",
  briefed: "var(--color-brass)",
  proposed: "var(--color-navy)",
  held: "var(--color-warning)",
  signed: "var(--color-success)",
  lost: "var(--color-text-muted)",
};

// Proposal-awareness badge (workflow overhaul) — cards previously gave zero
// indication of whether a proposal already existed for an enquiry. Labels
// mirror ProposalStatus (lib/api/types.ts) but read as a state, not a verb.
const PROPOSAL_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: "Proposal drafted", bg: "var(--color-surface)", color: "var(--color-text-secondary)" },
  pending_approval: { label: "Proposal pending", bg: "var(--color-surface)", color: "var(--color-text-secondary)" },
  sent: { label: "Proposal sent", bg: "var(--color-navy)", color: "#fff" },
  viewed: { label: "Proposal viewed", bg: "var(--color-brass)", color: "#fff" },
  accepted: { label: "Proposal won", bg: "var(--color-success)", color: "#fff" },
  declined: { label: "Proposal declined", bg: "var(--color-text-muted)", color: "#fff" },
};

// Mirrors api/app/services/stage_machine.py's ALLOWED_TRANSITIONS — used
// client-side only to decide which columns light up as valid drop targets
// while dragging (a UI nicety). The API re-validates every transition
// server-side regardless (trust boundary: the stage machine is the
// deterministic authority, this is just so a bad drop doesn't even look
// droppable), so this list drifting stale would fail safe as a rejected
// drop with a clear error, never a silent bad write.
// Owner-filter sentinel for enquiries with no forwarded_to (owner) yet — the
// intake/triage pool. Distinct from WHOLE_TEAM (everyone) and any real name.
const UNASSIGNED = "__unassigned__";

const ALLOWED_TRANSITIONS: Record<EnquiryStage, EnquiryStage[]> = {
  enquiry: ["briefed", "lost"],
  briefed: ["proposed", "lost"],
  proposed: ["held", "signed", "lost"],
  held: ["signed", "proposed", "lost"],
  signed: [],
  lost: [],
};

// Stalled: no stage movement in this many days — a real signal from
// enquiries.updated_at, not a fabricated field. Event-soon: the brief's
// own date window is this close and the deal still isn't held/signed.
const STALL_THRESHOLD_DAYS = 10;
const EVENT_SOON_DAYS = 14;

type SortKey = "recent" | "event_date" | "value" | "days_in_stage";

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Recent activity",
  event_date: "Event date (soonest)",
  value: "Value (highest)",
  days_in_stage: "Days in stage (longest)",
};

function sortStageCards(list: BoardCard[], sortBy: SortKey): BoardCard[] {
  if (sortBy === "recent") return list;
  const sorted = [...list];
  if (sortBy === "value") {
    sorted.sort((a, b) => (b.brief?.budget_amount ?? 0) - (a.brief?.budget_amount ?? 0));
  } else if (sortBy === "days_in_stage") {
    sorted.sort((a, b) => daysSince(b.enquiry.updated_at) - daysSince(a.enquiry.updated_at));
  } else if (sortBy === "event_date") {
    sorted.sort((a, b) => {
      const da = a.brief?.date_window_start;
      const db = b.brief?.date_window_start;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }
  return sorted;
}

const pillStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border)",
  background: "var(--color-bg)",
  color: "var(--color-text-secondary)",
  fontSize: "0.85rem",
};

function GuestIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** Pipeline Board (task H2) — the dashboard home, no separate overview page
 * (route-architecture.md). Kanban columns by stage; each card surfaces the
 * fields a salesperson needs at a glance (event type/guests/date/budget)
 * pulled from the enquiry's latest brief, not just a bare stage/name list.
 * "lost" enquiries are collapsed out of the main board. Visual direction
 * reworked 16 Jul toward client-shared reference screenshots, then given a
 * quality pass (19 Jul) for elevation/typography/motion polish — same brand
 * tokens throughout, no new colors or fonts introduced. */
export default function PipelineBoardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Role-based access (workflow overhaul) — RLS (migration 0022) already
  // guarantees a non-admin only ever gets their own enquiries back; `me`
  // just decides whether to render the salesperson pills/reassign controls
  // at all, since they'd have nothing to filter for a plain staff member.
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const TEAM = useStaffDirectory();
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  // Latest proposal per enquiry (workflow overhaul) — a cheap client-side
  // join, same pattern as the Inquiries inbox joining contacts/orgs. Lets a
  // card show real proposal progress instead of no signal at all.
  const [proposalByEnquiry, setProposalByEnquiry] = useState<Record<string, Proposal>>({});
  const [error, setError] = useState<string | null>(null);
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [search, setSearch] = useState("");
  // Status-rollup filter (task H3, 18 Jul) — Open/Awaiting/Won/Lost is the
  // reference-workflow-facing view layered on top of the granular stage
  // columns below; click a pill to see which enquiries are in that bucket
  // without leaving the board. null = show every status (default).
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | null>(null);
  // Salesperson/agent filter (forwarded_to — the real hand-off name, not
  // the unused assigned_to auth-id field). Sits alongside the status
  // rollup rather than replacing it: "who's it with" and "how far along"
  // are independent questions a manager asks about the same board.
  const [ownerFilter, setOwnerFilter] = useState<string>(WHOLE_TEAM);
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  // Drag-and-drop stage moves (task PM1) — the id currently being dragged
  // (null when nothing is), which column is currently a valid hover target,
  // and a transient action error banner for a rejected transition (e.g. an
  // illegal stage jump, or a network hiccup). transitioningId disables
  // interaction on the one card in flight rather than the whole board.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<EnquiryStage | "lost" | null>(null);
  // Pending decline — set when a card is dropped on "Lost", opens the
  // shared DeclineModal (same one used by the Inquiries inbox) rather than
  // a raw window.prompt.
  const [declineCardId, setDeclineCardId] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const suppressClickRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [enquiries, proposals] = await Promise.all([
        apiFetch<EnquiryWithBriefs[]>("/enquiries"),
        apiFetch<Proposal[]>("/proposals"),
      ]);
      const withBriefs = enquiries.map((enquiry) => ({
        enquiry,
        brief: [...enquiry.briefs].sort((a, b) => b.version - a.version)[0] ?? null,
      }));
      setCards(withBriefs);

      const latestByEnquiry: Record<string, Proposal> = {};
      for (const p of proposals) {
        const existing = latestByEnquiry[p.enquiry_id];
        if (!existing || p.version > existing.version) latestByEnquiry[p.enquiry_id] = p;
      }
      setProposalByEnquiry(latestByEnquiry);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pipeline");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowNewEnquiry(true);
      router.replace("/app");
    }
  }, [searchParams, router]);

  const columns: EnquiryStage[] = ENQUIRY_STAGES;

  // The stage machine (api/app/services/stage_machine.py via
  // POST /enquiries/{id}/transition) is the sole authority on whether a
  // move is legal — this just reports the outcome and refreshes the board;
  // it never mutates stage locally ahead of the server confirming.
  const runTransition = useCallback(
    async (enquiryId: string, stage: EnquiryStage | "lost", lostReason?: string) => {
      setActionError(null);
      setTransitioningId(enquiryId);
      try {
        await apiFetch(`/enquiries/${enquiryId}/transition`, {
          method: "POST",
          body: JSON.stringify({ stage, lost_reason: lostReason ?? null }),
        });
        await load();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Could not move this enquiry.");
      } finally {
        setTransitioningId(null);
      }
    },
    [load],
  );

  const reassign = useCallback(
    async (enquiryId: string, forwardedTo: string | null) => {
      setActionError(null);
      try {
        await apiFetch(`/enquiries/${enquiryId}`, {
          method: "PATCH",
          body: JSON.stringify({ forwarded_to: forwardedTo }),
        });
        await load();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Could not reassign this enquiry.");
      }
    },
    [load],
  );

  const handleDrop = useCallback(
    (target: EnquiryStage | "lost") => {
      const id = draggingId;
      setDraggingId(null);
      setDropTarget(null);
      if (!id) return;
      const card = cards?.find((c) => c.enquiry.id === id);
      if (!card || card.enquiry.stage === target) return;
      if (!ALLOWED_TRANSITIONS[card.enquiry.stage].includes(target as EnquiryStage)) {
        setActionError(`Can't move from ${STAGE_LABEL[card.enquiry.stage]} straight to ${target === "lost" ? "Lost" : STAGE_LABEL[target]}.`);
        return;
      }
      if (target === "lost") {
        // Opens the shared DeclineModal instead of transitioning straight
        // away — it does the POST /transition itself on submit.
        setDeclineCardId(id);
        return;
      }
      runTransition(id, target);
    },
    [draggingId, cards, runTransition],
  );

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

  // Status counts computed over every visible card (including "lost") so
  // the summary bar reflects the whole pipeline, not just the active board
  // below it — this is the answer to "what's the flow, is it open": every
  // enquiry's rollup status, at a glance, before you dig into stage columns.
  const statusCounts = useMemo(() => {
    const counts: Record<EnquiryStatus, number> = { open: 0, awaiting: 0, won: 0, lost: 0 };
    for (const c of visibleCards) counts[c.enquiry.status]++;
    return counts;
  }, [visibleCards]);

  const statusFilteredCards = useMemo(
    () => (statusFilter ? visibleCards.filter((c) => c.enquiry.status === statusFilter) : visibleCards),
    [visibleCards, statusFilter],
  );

  // Counted over statusFilteredCards (search + status rollup applied, owner
  // not yet applied) so the pill row's own counts stay stable while you
  // click between salespeople — same pattern as statusCounts above.
  const ownerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of statusFilteredCards) {
      const key = c.enquiry.forwarded_to || UNASSIGNED;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [statusFilteredCards]);

  const ownerFilteredCards = useMemo(() => {
    if (ownerFilter === WHOLE_TEAM) return statusFilteredCards;
    if (ownerFilter === UNASSIGNED) return statusFilteredCards.filter((c) => !c.enquiry.forwarded_to);
    return statusFilteredCards.filter((c) => c.enquiry.forwarded_to === ownerFilter);
  }, [statusFilteredCards, ownerFilter]);

  const activeCards = useMemo(
    () => ownerFilteredCards.filter((c) => c.enquiry.stage !== "lost"),
    [ownerFilteredCards],
  );
  const pipelineValue = useMemo(
    () => activeCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0),
    [activeCards],
  );

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <style>{`
        .pv-input { transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
        .pv-input:focus { outline: none; border-color: var(--color-navy) !important; box-shadow: 0 0 0 3px rgba(27, 42, 74, 0.10); }
        .pv-btn-ghost { transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast); cursor: pointer; }
        .pv-btn-ghost:hover { background: var(--color-surface); border-color: var(--color-text-muted) !important; }
        .pv-btn-primary { transition: background var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast); }
        .pv-btn-primary:hover { background: var(--color-accent-hover); box-shadow: var(--shadow-md); }
        .pv-btn-primary:active { transform: translateY(1px); }
        .pv-pill { transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast); cursor: pointer; }
        .pv-pill:hover { box-shadow: var(--shadow-sm); }
        .pv-card { transition: box-shadow var(--transition-base), transform var(--transition-base), border-color var(--transition-base); box-shadow: var(--shadow-sm); }
        .pv-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: var(--color-text-muted) !important; }
        .pv-lost-row { transition: box-shadow var(--transition-base), border-color var(--transition-base); }
        .pv-lost-row:hover { box-shadow: var(--shadow-sm); border-color: var(--color-text-muted) !important; }
        .pv-board::-webkit-scrollbar { height: 8px; }
        .pv-board::-webkit-scrollbar-track { background: transparent; }
        .pv-board::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-pill); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: "var(--space-6)", borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.1rem", color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            Pipeline
          </h1>
          {cards !== null && (
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-2) 0 0", fontSize: "0.92rem" }}>
              {activeCards.length} active enquir{activeCards.length === 1 ? "y" : "ies"} &middot;{" "}
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--color-text-primary)" }}>
                HKD {pipelineValue.toLocaleString()}
              </span>{" "}
              pipeline value
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "var(--space-4)", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }}>
              <SearchIcon />
            </span>
            <input
              placeholder="Search enquiries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pv-input"
              style={{ ...pillStyle, width: "220px", paddingLeft: "var(--space-8)" }}
            />
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: "var(--space-4)", color: "var(--color-text-muted)", pointerEvents: "none" }}>
              <SortIcon />
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="pv-input"
              style={{
                ...pillStyle,
                paddingLeft: "var(--space-8)",
                paddingRight: "var(--space-4)",
                cursor: "pointer",
                appearance: "none",
              }}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowNewEnquiry(true)}
            className="pv-btn-primary"
            style={{
              padding: "var(--space-2) var(--space-5)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            + New Enquiry
          </button>
        </div>
      </div>

      {cards !== null && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          {(["open", "awaiting", "won", "lost"] as EnquiryStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((current) => (current === s ? null : s))}
              className="pv-pill"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-pill)",
                border: statusFilter === s ? `1px solid ${STATUS_COLOR[s]}` : "1px solid var(--color-border)",
                background: statusFilter === s ? "var(--color-surface)" : "var(--color-bg)",
                fontSize: "0.85rem",
                boxShadow: statusFilter === s ? "var(--shadow-sm)" : "none",
              }}
              title={`${STATUS_LABEL[s]}: ${statusCounts[s]} enquir${statusCounts[s] === 1 ? "y" : "ies"}`}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: STATUS_COLOR[s],
                  display: "inline-block",
                }}
              />
              <span style={{ color: "var(--color-text-primary)", fontWeight: statusFilter === s ? 700 : 500 }}>
                {STATUS_LABEL[s]}
              </span>
              <span style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{statusCounts[s]}</span>
            </button>
          ))}
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="pv-btn-ghost"
              style={{ ...pillStyle, color: "var(--color-text-muted)", border: "1px solid transparent" }}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Admin sees/filters by everyone (RLS returns every row for them
          anyway); a plain staff member only ever gets their own rows back
          from the API, so the pill row has nothing to filter — a plain
          label says so instead of showing empty-looking pills. */}
      {cards !== null && me && !isAdmin && (
        <div style={{ marginTop: "var(--space-3)", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
          Showing <strong style={{ color: "var(--color-text-primary)" }}>my enquiries</strong>
        </div>
      )}

      {cards !== null && isAdmin && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginRight: "2px" }}>
            Salesperson
          </span>
          <button
            onClick={() => setOwnerFilter(WHOLE_TEAM)}
            className="pv-pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: ownerFilter === WHOLE_TEAM ? "1px solid var(--color-navy)" : "1px solid var(--color-border)",
              background: ownerFilter === WHOLE_TEAM ? "var(--color-surface)" : "var(--color-bg)",
              fontSize: "0.8rem",
              boxShadow: ownerFilter === WHOLE_TEAM ? "var(--shadow-sm)" : "none",
            }}
          >
            <span style={{ color: "var(--color-text-primary)", fontWeight: ownerFilter === WHOLE_TEAM ? 700 : 500 }}>
              {WHOLE_TEAM}
            </span>
          </button>
          <button
            onClick={() => setOwnerFilter((current) => (current === UNASSIGNED ? WHOLE_TEAM : UNASSIGNED))}
            className="pv-pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: ownerFilter === UNASSIGNED ? "1px solid var(--color-accent)" : "1px dashed var(--color-border)",
              background: ownerFilter === UNASSIGNED ? "var(--color-surface)" : "var(--color-bg)",
              fontSize: "0.8rem",
              boxShadow: ownerFilter === UNASSIGNED ? "var(--shadow-sm)" : "none",
            }}
            title="Enquiries with no owner yet — the intake pool"
          >
            <span style={{ color: "var(--color-text-secondary)", fontWeight: ownerFilter === UNASSIGNED ? 700 : 500 }}>
              Unassigned
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>{ownerCounts[UNASSIGNED] ?? 0}</span>
          </button>
          {TEAM.map((member) => {
            const active = ownerFilter === member.name;
            const color = OWNER_COLOR[member.name] ?? "var(--color-text-secondary)";
            const count = ownerCounts[member.name] ?? 0;
            return (
              <button
                key={member.name}
                onClick={() => setOwnerFilter((current) => (current === member.name ? WHOLE_TEAM : member.name))}
                className="pv-pill"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-pill)",
                  border: active ? `1px solid ${color}` : "1px solid var(--color-border)",
                  background: active ? "var(--color-surface)" : "var(--color-bg)",
                  fontSize: "0.8rem",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                }}
                title={`${member.name} · ${member.role}`}
              >
                <span
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: color,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initialsFromName(member.name)}
                </span>
                <span style={{ color: "var(--color-text-primary)", fontWeight: active ? 700 : 500 }}>{member.name}</span>
                <span style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>
      )}
      {!error && cards === null && (
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>Loading…</p>
      )}
      {actionError && (
        <div
          style={{
            marginTop: "var(--space-4)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-danger)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-danger)",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <WarningIcon />
          {actionError}
        </div>
      )}

      {/* Only shown mid-drag — a slim always-reachable target for the one
          transition that has no kanban column of its own ("lost" is
          collapsed out of the board per H2, but is still a valid drop
          target from any non-terminal stage). */}
      {draggingId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget("lost");
          }}
          onDragLeave={() => setDropTarget((t) => (t === "lost" ? null : t))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop("lost");
          }}
          style={{
            marginTop: "var(--space-4)",
            padding: "var(--space-3)",
            textAlign: "center",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: dropTarget === "lost" ? "#fff" : "var(--color-danger)",
            background: dropTarget === "lost" ? "var(--color-danger)" : "var(--color-bg)",
            border: `1px dashed var(--color-danger)`,
            borderRadius: "var(--radius-md)",
            transition: "background var(--transition-fast), color var(--transition-fast)",
          }}
        >
          Drop here to mark as Lost
        </div>
      )}

      {/* "lost" has no kanban column (it's collapsed out of activeCards by
          design, per H2) — clicking the Lost pill shows a flat list instead
          of an empty board. */}
      {cards !== null && statusFilter === "lost" && (
        <div style={{ marginTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: "480px" }}>
          {ownerFilteredCards.length === 0 && (
            <p style={{ color: "var(--color-text-muted)" }}>No lost enquiries.</p>
          )}
          {ownerFilteredCards.map(({ enquiry, brief }) => (
            <Link
              key={enquiry.id}
              href={`/app/enquiries/${enquiry.id}`}
              className="pv-lost-row"
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
              <div style={{ fontWeight: 600 }}>{brief?.event_type ?? "Untitled enquiry"}</div>
              {enquiry.lost_reason && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                  {enquiry.lost_reason}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {cards !== null && statusFilter !== "lost" && (
        <div
          className="pv-board"
          style={{
            display: "flex",
            gap: "var(--space-6)",
            marginTop: "var(--space-8)",
            overflowX: "auto",
            paddingBottom: "var(--space-5)",
            alignItems: "flex-start",
          }}
        >
          {columns.map((stage) => {
            const rawStageCards = activeCards.filter((c) => c.enquiry.stage === stage);
            const stageCards = sortStageCards(rawStageCards, sortBy);
            const stageValue = rawStageCards.reduce((sum, c) => sum + (c.brief?.budget_amount ?? 0), 0);
            const accent = STAGE_ACCENT[stage];
            const isValidTarget = draggingId
              ? ALLOWED_TRANSITIONS[cards?.find((c) => c.enquiry.id === draggingId)?.enquiry.stage ?? "enquiry"].includes(stage)
              : false;
            const isHoverTarget = dropTarget === stage;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  if (!draggingId || !isValidTarget) return;
                  e.preventDefault();
                  setDropTarget(stage);
                }}
                onDragLeave={() => setDropTarget((t) => (t === stage ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(stage);
                }}
                style={{
                  minWidth: "292px",
                  flex: "0 0 292px",
                  borderRadius: "var(--radius-lg)",
                  outline: isHoverTarget ? `2px dashed ${accent}` : "2px dashed transparent",
                  outlineOffset: "6px",
                  transition: "outline-color var(--transition-fast)",
                  opacity: draggingId && !isValidTarget ? 0.55 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: "var(--space-3)",
                    borderBottom: `2px solid ${accent}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: accent, display: "inline-block" }} />
                    <h2
                      style={{
                        fontSize: "0.78rem",
                        margin: 0,
                        color: "var(--color-text-primary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontWeight: 600,
                      }}
                    >
                      {STAGE_LABEL[stage]}
                    </h2>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "22px",
                      height: "22px",
                      padding: "0 6px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--color-surface)",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "var(--color-text-secondary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {stageCards.length}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--color-text-muted)",
                    margin: "var(--space-2) 0 var(--space-4)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  HKD {stageValue.toLocaleString()}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {stageCards.map(({ enquiry, brief }) => {
                    const daysInStage = daysSince(enquiry.updated_at);
                    const isStalled = daysInStage >= STALL_THRESHOLD_DAYS;
                    const daysToEvent = brief?.date_window_start ? daysUntil(brief.date_window_start) : null;
                    const eventSoon =
                      daysToEvent !== null && daysToEvent <= EVENT_SOON_DAYS && stage !== "held" && stage !== "signed";
                    const isTransitioning = transitioningId === enquiry.id;
                    const proposal = proposalByEnquiry[enquiry.id];
                    return (
                      <div
                        key={enquiry.id}
                        role="link"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", enquiry.id);
                          e.dataTransfer.effectAllowed = "move";
                          suppressClickRef.current = true;
                          setDraggingId(enquiry.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        onClick={() => {
                          if (suppressClickRef.current) {
                            suppressClickRef.current = false;
                            return;
                          }
                          router.push(`/app/enquiries/${enquiry.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/app/enquiries/${enquiry.id}`);
                          }
                        }}
                        className="pv-card"
                        style={{
                          display: "block",
                          padding: "var(--space-4)",
                          background: "var(--color-bg)",
                          border: `1px solid ${isStalled ? "var(--color-warning)" : "var(--color-border)"}`,
                          borderTop: `3px solid ${accent}`,
                          borderRadius: "var(--radius-lg)",
                          color: "var(--color-text-primary)",
                          textDecoration: "none",
                          cursor: isTransitioning ? "wait" : "grab",
                          opacity: isTransitioning ? 0.5 : 1,
                          pointerEvents: isTransitioning ? "none" : "auto",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.3 }}>
                            {brief?.event_type ?? "Untitled enquiry"}
                          </div>
                          <span
                            title={enquiry.forwarded_to ?? "Unassigned"}
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "50%",
                              background: enquiry.forwarded_to
                                ? OWNER_COLOR[enquiry.forwarded_to] ?? "var(--color-text-muted)"
                                : "var(--color-surface)",
                              border: enquiry.forwarded_to ? "none" : "1px dashed var(--color-border)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              flexShrink: 0,
                              boxShadow: "0 0 0 2px var(--color-bg)",
                            }}
                          >
                            {enquiry.forwarded_to ? initialsFromName(enquiry.forwarded_to) : ""}
                          </span>
                        </div>

                        {/* Reassign inline — a real select, not just a
                            display badge, so the board doubles as a
                            management surface and not just a viewer.
                            stopPropagation on both events: pointerdown so
                            opening/using the dropdown never starts a card
                            drag, click so picking an option never
                            navigates into the enquiry. Admin-only: a plain
                            staff member's own row is already assigned to
                            them (that's the only reason they can see it),
                            and RLS (migration 0022) would reject their own
                            UPDATE if it tried to change assigned_to anyway
                            — so for them this renders as plain text. */}
                        {isAdmin ? (
                          <select
                            value={enquiry.forwarded_to ?? ""}
                            draggable={false}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              reassign(enquiry.id, e.target.value || null);
                            }}
                            style={{
                              marginTop: "2px",
                              fontSize: "0.75rem",
                              color: "var(--color-text-secondary)",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              maxWidth: "100%",
                            }}
                          >
                            <option value="">Unassigned</option>
                            {TEAM.map((member) => (
                              <option key={member.name} value={member.name}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ marginTop: "2px", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                            {enquiry.forwarded_to ?? "Unassigned"}
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px var(--space-2)",
                              borderRadius: "var(--radius-pill)",
                              background: "var(--color-surface)",
                              fontSize: "0.72rem",
                              fontWeight: 500,
                              color: "var(--color-text-secondary)",
                              textTransform: "capitalize",
                            }}
                          >
                            {enquiry.channel}
                          </span>
                          {isStalled && (
                            <span
                              title={`No stage movement in ${daysInStage} days`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px var(--space-2)",
                                borderRadius: "var(--radius-pill)",
                                background: "var(--color-warning)",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: "#fff",
                              }}
                            >
                              <WarningIcon />
                              Stalled
                            </span>
                          )}
                          {eventSoon && (
                            <span
                              title="Event date is approaching and this enquiry isn't confirmed yet"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px var(--space-2)",
                                borderRadius: "var(--radius-pill)",
                                background: "var(--color-danger)",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: "#fff",
                              }}
                            >
                              <WarningIcon />
                              {daysToEvent !== null && daysToEvent < 0
                                ? "Event passed"
                                : `Event in ${daysToEvent}d`}
                            </span>
                          )}
                          {proposal && (
                            <Link
                              href={`/app/proposals/${proposal.id}`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              title="Open this enquiry's proposal"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px var(--space-2)",
                                borderRadius: "var(--radius-pill)",
                                background: PROPOSAL_BADGE[proposal.status]?.bg ?? "var(--color-surface)",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: PROPOSAL_BADGE[proposal.status]?.color ?? "var(--color-text-secondary)",
                                textDecoration: "none",
                              }}
                            >
                              {PROPOSAL_BADGE[proposal.status]?.label ?? "Proposal"}
                            </Link>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                          {brief?.guest_count && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <GuestIcon />
                              {brief.guest_count}
                            </span>
                          )}
                          {brief?.date_window_start && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <CalendarIcon />
                              {brief.date_window_start}
                              {brief.date_window_end && brief.date_window_end !== brief.date_window_start
                                ? ` – ${brief.date_window_end}`
                                : ""}
                            </span>
                          )}
                        </div>

                        {brief?.budget_amount && (
                          <div style={{ marginTop: "var(--space-3)", fontWeight: 700, fontSize: "0.95rem", fontVariantNumeric: "tabular-nums", color: "var(--color-text-primary)" }}>
                            HKD {brief.budget_amount.toLocaleString()}
                            {brief.budget_basis === "per_head" ? (
                              <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", fontSize: "0.78rem" }}> / head</span>
                            ) : (
                              ""
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.72rem",
                            color: isStalled ? "var(--color-warning)" : "var(--color-text-muted)",
                            fontWeight: isStalled ? 600 : 400,
                            marginTop: "var(--space-3)",
                            paddingTop: "var(--space-2)",
                            borderTop: "1px solid var(--color-border)",
                          }}
                        >
                          <ClockIcon />
                          {daysInStage} day{daysInStage === 1 ? "" : "s"} in stage
                        </div>
                      </div>
                    );
                  })}
                  {stageCards.length === 0 && (
                    <div
                      style={{
                        border: "1px dashed var(--color-border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "var(--space-4)",
                        textAlign: "center",
                        fontSize: "0.78rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      No enquiries here yet
                    </div>
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

      {declineCardId && (
        <DeclineModal
          enquiryId={declineCardId}
          headline={cards?.find((c) => c.enquiry.id === declineCardId)?.brief?.event_type ?? "Enquiry"}
          onClose={() => setDeclineCardId(null)}
          onDeclined={() => {
            setDeclineCardId(null);
            load();
          }}
        />
      )}
    </main>
  );
}
