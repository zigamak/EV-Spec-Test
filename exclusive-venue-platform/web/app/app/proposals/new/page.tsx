"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type {
  Brief,
  Contact,
  Enquiry,
  Organisation,
  Proposal,
  ProposalVenue,
  ShortlistEntry,
  ShortlistResponse,
  VenueWithPortfolio,
} from "@/lib/api/types";

/**
 * Proposal Builder (task G3) — the guided 4-step flow from the reference
 * design. It doesn't add any server capability; it sequences endpoints that
 * already exist (brief parse, shortlist, pricing, copy/link generation) into
 * the "Inquiry → Proposal" workflow, with a draft proposal as the
 * autosave target.
 *
 * Step 1 (The Enquiry) is built. Steps 2–4 are scaffolded placeholders that
 * land next — the progress rail, breadcrumb, draft creation and navigation
 * are already wired so they slot in without reshaping this page.
 */

const STEPS = [
  { n: 1, label: "The enquiry", caption: "Read brief, structure with AI" },
  { n: 2, label: "Curate venues", caption: "Browse ribbon, pick 1–5" },
  { n: 3, label: "Generate pricing", caption: "From rules engine, per venue" },
  { n: 4, label: "Generate proposal", caption: "Web link, PDF, or both" },
] as const;

interface Requirements {
  format_needs?: string[];
  tech_needs?: string[];
  mood?: string[];
}

const EYEBROW: React.CSSProperties = {
  fontSize: "0.62rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-accent)",
  fontWeight: 600,
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "0.62rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
  fontWeight: 600,
};

const TAG: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  fontSize: "0.6rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderRadius: "2px",
};

function formatWindow(brief: Brief | null): string | null {
  if (!brief?.date_window_start) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const start = fmt(brief.date_window_start);
  if (brief.date_window_end && brief.date_window_end !== brief.date_window_start) {
    return `${start} – ${fmt(brief.date_window_end)}`;
  }
  return start;
}

function budgetLine(brief: Brief | null): string | null {
  if (!brief) return null;
  if (brief.budget_amount) {
    const basis = brief.budget_basis === "per_head" ? " / head" : "";
    return `HKD ${brief.budget_amount.toLocaleString()}${basis}`;
  }
  if (brief.budget_status === "tbc" && brief.budget_estimate_low && brief.budget_estimate_high) {
    return `TBC · est. HKD ${brief.budget_estimate_low.toLocaleString()}–${brief.budget_estimate_high.toLocaleString()}`;
  }
  return brief.budget_status === "tbc" ? "TBC" : null;
}

export default function ProposalBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enquiryId = searchParams.get("enquiry");

  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);

  // Step 2 state
  const [shortlist, setShortlist] = useState<ShortlistResponse | null>(null);
  const [portfolio, setPortfolio] = useState<VenueWithPortfolio[] | null>(null);
  const [picked, setPicked] = useState<ProposalVenue[]>([]);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [venueView, setVenueView] = useState<"all" | "fits">("all");

  const ensureDraftProposal = useCallback(
    async (enq: Enquiry, latestBrief: Brief, orgName: string | null) => {
      const existing = await apiFetch<Proposal[]>(`/proposals?enquiry_id=${enq.id}`);
      const draft = existing.find((p) => p.status === "draft");
      if (draft) {
        setProposal(draft);
        return;
      }
      const title = `${orgName ?? "Proposal"} · ${latestBrief.event_type ?? "event"}`;
      const created = await apiFetch<Proposal>("/proposals", {
        method: "POST",
        body: JSON.stringify({ enquiry_id: enq.id, brief_id: latestBrief.id, title }),
      });
      setProposal(created);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!enquiryId) {
      setError("No enquiry specified.");
      return;
    }
    setError(null);
    try {
      const enq = await apiFetch<Enquiry>(`/enquiries/${enquiryId}`);
      setEnquiry(enq);

      const briefs = await apiFetch<Brief[]>(`/enquiries/${enquiryId}/briefs`);
      const latest = [...briefs].sort((a, b) => b.version - a.version)[0] ?? null;
      setBrief(latest);

      let orgName: string | null = null;
      if (enq.contact_id) {
        const c = await apiFetch<Contact>(`/contacts/${enq.contact_id}`).catch(() => null);
        setContact(c);
        if (c?.organisation_id) {
          const orgs = await apiFetch<Organisation[]>("/organisations");
          const found = orgs.find((o) => o.id === c.organisation_id) ?? null;
          setOrg(found);
          orgName = found?.name ?? null;
        }
      }

      // A draft proposal is the autosave target — only creatable once a
      // brief exists (proposals.brief_id is required), so Step 1 can parse
      // first and create the draft once there's something to pin.
      if (latest) await ensureDraftProposal(enq, latest, orgName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the enquiry.");
    }
  }, [enquiryId, ensureDraftProposal]);

  useEffect(() => {
    load();
  }, [load]);

  async function reSummarise() {
    if (!enquiryId) return;
    setParsing(true);
    setError(null);
    try {
      const fresh = await apiFetch<Brief>(`/enquiries/${enquiryId}/briefs/parse`, { method: "POST" });
      setBrief(fresh);
      if (enquiry && !proposal) await ensureDraftProposal(enquiry, fresh, org?.name ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't summarise the email.");
    } finally {
      setParsing(false);
    }
  }

  const loadVenues = useCallback(async () => {
    if (!brief || !proposal) return;
    setVenuesError(null);
    try {
      const [pf, pv] = await Promise.all([
        apiFetch<VenueWithPortfolio[]>("/venues/portfolio?status_filter=active"),
        apiFetch<ProposalVenue[]>(`/proposals/${proposal.id}/venues`),
      ]);
      setPortfolio(pf);
      setPicked(pv);
    } catch (err) {
      setVenuesError(err instanceof ApiError ? err.message : "Failed to load venues.");
      return;
    }
    // The shortlist (which venues fit + their pricing) is a separate call and
    // can 422 if the brief lacks guests/date/duration — in that case you can
    // still browse the portfolio, just without "fits brief" pricing.
    try {
      setShortlist(await apiFetch<ShortlistResponse>(`/briefs/${brief.id}/shortlist`));
    } catch (err) {
      setShortlist({ shortlist: [], excluded: [] });
      if (err instanceof ApiError && err.status === 422) {
        setVenuesError(
          "Add guests, a date, and duration to the brief to price venue matches — you can still browse below.",
        );
      }
    }
  }, [brief, proposal]);

  useEffect(() => {
    if (step === 2) loadVenues();
  }, [step, loadVenues]);

  async function toggleVenue(venueId: string, entry: ShortlistEntry | undefined) {
    if (!proposal) return;
    const existing = picked.find((p) => p.venue_id === venueId);
    setTogglingId(venueId);
    setVenuesError(null);
    try {
      if (existing) {
        await apiFetch(`/proposals/${proposal.id}/venues/${existing.id}`, { method: "DELETE" });
        setPicked((prev) => prev.filter((p) => p.id !== existing.id));
      } else {
        // Only addable when the shortlist priced it: proposal_venues require
        // a pricing rule + computed quote, which only the shortlist provides.
        if (!entry?.pricing_rules_id || entry.quote_breakdown == null || entry.estimated_total == null) return;
        if (picked.length >= 5) return;
        const created = await apiFetch<ProposalVenue>(`/proposals/${proposal.id}/venues`, {
          method: "POST",
          body: JSON.stringify({
            venue_id: entry.venue_id,
            configuration_id: entry.configuration_id,
            pricing_rules_id: entry.pricing_rules_id,
            quote_breakdown: entry.quote_breakdown,
            quote_total: entry.estimated_total,
            sort_order: picked.length,
            recommended: false,
          }),
        });
        setPicked((prev) => [...prev, created]);
      }
    } catch (err) {
      setVenuesError(err instanceof ApiError ? err.message : "Couldn't update the shortlist.");
    } finally {
      setTogglingId(null);
    }
  }

  const nameForVenue = useCallback(
    (venueId: string) => portfolio?.find((v) => v.id === venueId)?.name ?? "Venue",
    [portfolio],
  );

  const reqs = (brief?.requirements ?? {}) as Requirements;
  const captured = useMemo(() => {
    if (!brief) return 0;
    return [
      brief.date_window_start,
      brief.guest_count,
      brief.event_type,
      brief.duration_hours,
      brief.time_of_day,
      brief.budget_status !== "unspecified" ? "x" : null,
      brief.location_preference,
      reqs.format_needs?.length ? "x" : null,
      reqs.tech_needs?.length ? "x" : null,
      reqs.mood?.length ? "x" : null,
    ].filter(Boolean).length;
  }, [brief, reqs]);
  const toConfirm = brief?.fields_to_confirm?.length ?? 0;
  const flagged = brief?.flagged_fields?.length ?? 0;

  const clientName = org?.name ?? contact?.full_name ?? "Client";
  const proposalRef = proposal ? `#${proposal.id.slice(0, 4).toUpperCase()}` : "—";
  const eventLabel = brief?.event_type ?? "enquiry";
  const currentStep = STEPS[step - 1] ?? STEPS[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--color-surface)" }}>
      {/* Header band */}
      <div style={{ background: "var(--color-surface)", padding: "var(--space-8) var(--space-10) var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-4)" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.3rem", margin: 0 }}>
            Proposal builder ·{" "}
            <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>4 steps</span>, ~12 minutes
          </h1>
          <span style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            Click a step to navigate
          </span>
        </div>
      </div>

      {/* Breadcrumb + autosave */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          padding: "var(--space-4) var(--space-10)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ color: "var(--color-text-secondary)" }}>
          <Link href="/app/proposals" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
            Proposals
          </Link>
          {"  /  "}
          {clientName} · {eventLabel}
          {"  /  "}
          <strong style={{ color: "var(--color-text-primary)" }}>Step {step} · {currentStep.label}</strong>
        </div>
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", color: "var(--color-text-muted)" }}>
          <span>
            <span style={{ color: "var(--color-success)" }}>●</span> {proposal ? "Draft saved" : "Not started"}
          </span>
          <span>Proposal {proposalRef}</span>
        </div>
      </div>

      {/* Progress rail */}
      <div style={{ display: "flex", gap: "var(--space-4)", padding: "var(--space-8) var(--space-10)", background: "var(--color-bg)", overflowX: "auto" }}>
        {STEPS.map((s) => {
          const state = s.n < step ? "done" : s.n === step ? "current" : "upcoming";
          const circleBg =
            state === "done" ? "var(--color-navy)" : state === "current" ? "var(--color-accent)" : "var(--color-surface)";
          const circleColor = state === "upcoming" ? "var(--color-text-muted)" : "#fff";
          return (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              style={{ flex: 1, minWidth: "180px", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  background: circleBg,
                  color: circleColor,
                  border: state === "upcoming" ? "1px solid var(--color-border)" : "none",
                  fontFamily: "var(--font-serif)",
                  fontSize: "1rem",
                }}
              >
                {s.n}
              </span>
              <div style={{ ...SECTION_LABEL, marginTop: "var(--space-3)" }}>Step {["one", "two", "three", "four"][s.n - 1]}</div>
              <div
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "1.35rem",
                  color: state === "upcoming" ? "var(--color-text-muted)" : "var(--color-text-primary)",
                  marginTop: "2px",
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>{s.caption}</div>
            </button>
          );
        })}
      </div>

      {/* Step body */}
      <div style={{ flex: 1, padding: "var(--space-10)" }}>
        {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

        {step === 1 && (
          <div>
            <div style={EYEBROW}>Step 01 · The enquiry, as it arrived</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.6rem", margin: "var(--space-3) 0 var(--space-2)" }}>
              Read the brief, <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>let AI do the rest.</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "640px", marginTop: 0 }}>
              The client&apos;s message stays exactly as written. Concierge structures it into a clean briefing on the
              right — review, refine, then move on.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-6)", marginTop: "var(--space-6)" }}>
              {/* Left — raw email */}
              <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)" }}>
                <div style={SECTION_LABEL}>The message, as it arrived</div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "var(--space-2) 0 var(--space-4)", paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border)" }}>
                  From <strong style={{ color: "var(--color-text-secondary)" }}>{contact?.full_name ?? "Unknown"}</strong>
                  {contact?.email ? ` · ${contact.email}` : ""}
                  {enquiry ? ` · ${enquiry.channel}` : ""}
                </div>
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
                  {enquiry?.raw_content ?? "Loading…"}
                </p>
              </div>

              {/* Right — structured briefing */}
              <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <div style={{ padding: "var(--space-6) var(--space-6) var(--space-4)" }}>
                  <div style={EYEBROW}>✦ Concierge AI</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.7rem", marginTop: "var(--space-1)" }}>
                    Structured <span style={{ fontStyle: "italic" }}>briefing</span>
                  </div>
                  {brief ? (
                    <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                      {(brief.confidence * 100).toFixed(0)}% confidence
                      {flagged > 0 && (
                        <span style={{ color: "var(--color-warning)" }}> · {flagged} field{flagged === 1 ? "" : "s"} flagged</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
                      No structured brief yet.
                    </div>
                  )}
                </div>

                {brief && !editingBrief && (
                  <div>
                    <BriefField label="Client" value={org?.name ?? contact?.full_name ?? "—"} sub={org ? [org.tier ? `${org.tier} brand client` : null, org.rate_card_on_file ? "rate card on file" : null].filter(Boolean).join(" · ") : undefined} />
                    <BriefField label="Event type" value={brief.event_type ?? "—"} shaded />
                    <BriefField label="Guests" value={brief.guest_count ? `${brief.guest_count} pax` : "—"} />
                    <BriefField
                      label="Date window"
                      value={formatWindow(brief) ?? "—"}
                      warn={brief.event_date_flexible || (brief.flagged_fields ?? []).includes("date_window_start")}
                      sub={
                        brief.date_suggestions?.length
                          ? `Awaiting confirmation · suggest ${brief.date_suggestions.join(" or ")}`
                          : undefined
                      }
                      shaded
                    />
                    <BriefField
                      label="Duration"
                      value={[brief.duration_hours ? `${brief.duration_hours} hours` : null, brief.time_of_day].filter(Boolean).join(" · ") || "—"}
                    />
                    {reqs.format_needs?.length ? <BriefField label="Format needs" value={reqs.format_needs.join(" · ")} shaded /> : null}
                    {reqs.tech_needs?.length ? <BriefField label="Tech" value={reqs.tech_needs.join(" · ")} /> : null}
                    <BriefField label="Budget" value={budgetLine(brief) ?? "—"} warn={brief.budget_status === "tbc"} shaded />
                    {reqs.mood?.length ? <BriefField label="Mood" value={reqs.mood.join(" · ")} /> : null}
                  </div>
                )}

                {brief && editingBrief && (
                  <BriefEditor
                    brief={brief}
                    enquiryId={enquiryId!}
                    onSaved={(updated) => {
                      setBrief(updated);
                      setEditingBrief(false);
                    }}
                    onCancel={() => setEditingBrief(false)}
                  />
                )}

                <div style={{ padding: "var(--space-5) var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {brief && !editingBrief && (
                    <button
                      type="button"
                      onClick={() => setEditingBrief(true)}
                      style={{
                        padding: "var(--space-3)",
                        border: "1px solid var(--color-border)",
                        background: "var(--color-bg)",
                        color: "var(--color-navy)",
                        fontSize: "0.68rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Edit fields 
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reSummarise}
                    disabled={parsing}
                    style={{
                      padding: "var(--space-3)",
                      border: "1px solid var(--color-accent)",
                      background: "var(--color-bg)",
                      color: "var(--color-accent)",
                      fontSize: "0.68rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      cursor: parsing ? "default" : "pointer",
                    }}
                  >
                    {parsing ? "Summarising…" : brief ? "✦ Re-summarise email" : "✦ Summarise email with AI"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={EYEBROW}>Step 02 · Curate the shortlist</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.6rem", margin: "var(--space-3) 0 var(--space-2)" }}>
              Pick venues by <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>feel and judgement.</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "640px", marginTop: 0 }}>
              Browse the portfolio and select between 1 and 5 venues. No AI ranking, no scoring — the selection is yours.
              &ldquo;Fits brief&rdquo; just means it&apos;s available and priced for this enquiry.
            </p>

            {venuesError && (
              <p style={{ color: "var(--color-warning)", marginTop: "var(--space-4)" }}>{venuesError}</p>
            )}

            {/* View toggle (category ribbon deferred until venues have a category column) */}
            <div style={{ display: "flex", gap: "var(--space-5)", borderBottom: "1px solid var(--color-border)", marginTop: "var(--space-6)" }}>
              {([
                { key: "all" as const, label: "All venues", count: portfolio?.length ?? 0 },
                { key: "fits" as const, label: "Fits brief", count: shortlist?.shortlist.length ?? 0 },
              ]).map((t) => {
                const active = venueView === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setVenueView(t.key)}
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
                    {t.label}{" "}
                    <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "0.9rem" }}>{t.count}</span>
                  </button>
                );
              })}
            </div>

            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: "var(--space-6) 0 var(--space-4)" }}>
              The <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>portfolio</span>
            </h3>

            {portfolio === null ? (
              <p style={{ color: "var(--color-text-muted)" }}>Loading venues…</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-6)", paddingBottom: "var(--space-10)" }}>
                {portfolio
                  .filter((v) => venueView === "all" || shortlist?.shortlist.some((s) => s.venue_id === v.id))
                  .map((v) => {
                    const entry = shortlist?.shortlist.find((s) => s.venue_id === v.id);
                    const excluded = shortlist?.excluded.find((e) => e.venue_id === v.id);
                    const selected = picked.some((p) => p.venue_id === v.id);
                    const addable = Boolean(entry?.pricing_rules_id && entry?.quote_breakdown != null && entry?.estimated_total != null);
                    const hero = v.venue_media.find((m) => m.kind === "photo")?.url ?? v.venue_media[0]?.url ?? null;
                    const cap =
                      entry?.capacity ??
                      (v.venue_configurations.length ? Math.max(...v.venue_configurations.map((c) => c.capacity)) : null);
                    const disabled = !selected && !addable;
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleVenue(v.id, entry)}
                        disabled={disabled || togglingId === v.id}
                        title={disabled ? excluded?.reason ?? "No pricing set for this brief" : undefined}
                        style={{
                          textAlign: "left",
                          padding: 0,
                          background: "var(--color-bg)",
                          border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.55 : 1,
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ position: "relative", height: "170px", background: "var(--color-surface)" }}>
                          {hero ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={hero} alt={v.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                              No photo yet
                            </div>
                          )}
                          {entry && (
                            <span style={{ position: "absolute", top: "var(--space-3)", left: "var(--space-3)", ...TAG, background: "var(--color-accent)", color: "#fff" }}>
                              Fits brief
                            </span>
                          )}
                          <span
                            style={{
                              position: "absolute",
                              top: "var(--space-3)",
                              right: "var(--space-3)",
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: selected ? "var(--color-accent)" : "rgba(255,255,255,0.85)",
                              color: selected ? "#fff" : "var(--color-navy)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.85rem",
                            }}
                          >
                            {selected ? "✓" : "+"}
                          </span>
                        </div>
                        <div style={{ padding: "var(--space-4)" }}>
                          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem" }}>{v.name}</div>
                          <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "2px 0 var(--space-3)" }}>
                            {v.district ?? "—"}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--color-text-secondary)", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
                            <span>{cap ? `to ${cap}` : "Capacity TBD"}</span>
                            {entry?.estimated_total != null && <span>HKD {entry.estimated_total.toLocaleString()}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {step > 2 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", textAlign: "center", color: "var(--color-text-muted)" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.8rem", color: "var(--color-text-secondary)" }}>
              {currentStep.label}
            </div>
            <p style={{ maxWidth: "440px" }}>
              This step lands next. Its endpoints already exist —{" "}
              {step === 3 && "per-venue pricing from the rules engine, with overrides"}
              {step === 4 && "intro copy and the shareable web link"} — the builder just needs the screen.
            </p>
            <button type="button" onClick={() => setStep(2)} style={{ marginTop: "var(--space-4)", background: "none", border: "1px solid var(--color-border)", padding: "var(--space-2) var(--space-4)", cursor: "pointer" }}>
              ← Back to venues
            </button>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-10)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-bg)",
        }}
      >
        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {step === 1 &&
            (brief ? (
              <span>
                Brief consolidated. <strong>{captured} fields</strong> captured
                {toConfirm > 0 && (
                  <>
                    {" "}· <span style={{ fontStyle: "italic", color: "var(--color-warning)" }}>{toConfirm} to confirm with client</span>
                  </>
                )}
                .
              </span>
            ) : (
              "Summarise the email to consolidate a brief."
            ))}
          {step === 2 && (
            <>
              <span style={{ ...SECTION_LABEL }}>Shortlist · {picked.length}</span>
              {picked.map((p) => (
                <span
                  key={p.id}
                  style={{ ...TAG, background: "var(--color-surface)", color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span style={{ fontStyle: "italic", fontFamily: "var(--font-serif)", fontSize: "0.85rem", textTransform: "none", letterSpacing: 0 }}>
                    {nameForVenue(p.venue_id)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVenue(p.venue_id, undefined);
                    }}
                    style={{ cursor: "pointer", color: "var(--color-text-muted)" }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </>
          )}
          {step >= 3 && <span>Step {step} of 4</span>}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => router.push(enquiryId ? `/app/enquiries/${enquiryId}` : "/app/enquiries")}
              style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
            >
              Save &amp; exit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
            >
              ← Back
            </button>
          )}
          {(() => {
            const canAdvance =
              step === 1 ? Boolean(brief) : step === 2 ? picked.length >= 1 : step < 4;
            const label = step === 1 ? "Continue to venues →" : step === 2 ? "Generate pricing →" : "Continue →";
            if (step >= 4) return null;
            return (
              <button
                type="button"
                onClick={() => canAdvance && setStep(step + 1)}
                disabled={!canAdvance}
                style={{
                  padding: "var(--space-3) var(--space-5)",
                  border: "1px solid var(--color-accent)",
                  background: canAdvance ? "var(--color-accent)" : "var(--color-surface)",
                  color: canAdvance ? "#fff" : "var(--color-text-muted)",
                  fontSize: "0.68rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  cursor: canAdvance ? "pointer" : "default",
                }}
              >
                {label}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function BriefField({
  label,
  value,
  sub,
  warn,
  shaded,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  shaded?: boolean;
}) {
  return (
    <div
      style={{
        padding: "var(--space-4) var(--space-6)",
        background: shaded ? "var(--color-surface)" : "transparent",
      }}
    >
      <div style={SECTION_LABEL}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.2rem", marginTop: "2px" }}>
        {value}
        {warn && <span title="To confirm with client" style={{ color: "var(--color-warning)" }}> ⚠</span>}
      </div>
      {sub && <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>{sub}</div>}
    </div>
  );
}

/** Inline brief editor — lets staff correct/complete what the AI extracted
 * (or the client never said) before building the proposal. Saves via the
 * brief PATCH endpoint, which records a 'brief.edited' audit entry and marks
 * the brief human_corrected. */
function BriefEditor({
  brief,
  enquiryId,
  onSaved,
  onCancel,
}: {
  brief: Brief;
  enquiryId: string;
  onSaved: (b: Brief) => void;
  onCancel: () => void;
}) {
  const [eventType, setEventType] = useState(brief.event_type ?? "");
  const [guests, setGuests] = useState(brief.guest_count?.toString() ?? "");
  const [dateStart, setDateStart] = useState(brief.date_window_start ?? "");
  const [dateEnd, setDateEnd] = useState(brief.date_window_end ?? "");
  const [duration, setDuration] = useState(brief.duration_hours?.toString() ?? "");
  const [timeOfDay, setTimeOfDay] = useState<string>(brief.time_of_day ?? "");
  const [budgetStatus, setBudgetStatus] = useState<string>(brief.budget_status);
  const [budgetAmount, setBudgetAmount] = useState(brief.budget_amount?.toString() ?? "");
  const [budgetBasis, setBudgetBasis] = useState<string>(brief.budget_basis ?? "");
  const [location, setLocation] = useState(brief.location_preference ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input: React.CSSProperties = {
    width: "100%",
    padding: "var(--space-2)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    font: "inherit",
  };
  const label: React.CSSProperties = { ...SECTION_LABEL, display: "block", marginBottom: "4px" };
  const row: React.CSSProperties = { padding: "var(--space-3) var(--space-6)" };

  async function save() {
    setSaving(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      event_type: eventType || null,
      guest_count: guests ? Number(guests) : null,
      date_window_start: dateStart || null,
      date_window_end: dateEnd || null,
      duration_hours: duration ? Number(duration) : null,
      time_of_day: timeOfDay || null,
      location_preference: location || null,
      budget_status: budgetStatus,
    };
    if (budgetAmount) {
      payload.budget_amount = Number(budgetAmount);
      payload.budget_basis = budgetBasis || "total";
    }
    try {
      const updated = await apiFetch<Brief>(`/enquiries/${enquiryId}/briefs/${brief.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't save the brief.");
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "var(--space-4) 0" }}>
      <div style={row}>
        <label style={label}>Event type</label>
        <input style={input} value={eventType} onChange={(e) => setEventType(e.target.value)} />
      </div>
      <div style={row}>
        <label style={label}>Guests</label>
        <input style={input} type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
      </div>
      <div style={{ ...row, display: "flex", gap: "var(--space-3)" }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Date from</label>
          <input style={input} type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Date to</label>
          <input style={input} type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </div>
      </div>
      <div style={{ ...row, display: "flex", gap: "var(--space-3)" }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Duration (hours)</label>
          <input style={input} type="number" min="0" step="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Time of day</label>
          <select style={input} value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)}>
            <option value="">—</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
            <option value="full_day">Full day</option>
          </select>
        </div>
      </div>
      <div style={{ ...row, display: "flex", gap: "var(--space-3)" }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Budget status</label>
          <select style={input} value={budgetStatus} onChange={(e) => setBudgetStatus(e.target.value)}>
            <option value="unspecified">Unspecified</option>
            <option value="tbc">TBC</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Budget amount (HKD)</label>
          <input style={input} type="number" min="0" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Basis</label>
          <select style={input} value={budgetBasis} onChange={(e) => setBudgetBasis(e.target.value)}>
            <option value="total">Total</option>
            <option value="per_head">Per head</option>
          </select>
        </div>
      </div>
      <div style={row}>
        <label style={label}>Location preference</label>
        <input style={input} value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      {err && <p style={{ color: "var(--color-danger)", padding: "0 var(--space-6)" }}>{err}</p>}

      <div style={{ ...row, display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "#fff", fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "Saving…" : "Save brief"}
        </button>
      </div>
    </div>
  );
}
