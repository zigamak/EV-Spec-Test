"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDownload, apiFetch, apiFetchText, ApiError } from "@/lib/api/client";
import ThinkingOrb from "@/components/ThinkingOrb";
import type {
  Brief,
  Contact,
  Enquiry,
  Organisation,
  Proposal,
  ProposalLinkToken,
  ProposalVenue,
  QuoteBreakdown,
  VenueOption,
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

// EVA Service Fee — kept in lockstep with api/app/services/proposal_pdf.py and
// the proposal document. Every client-facing total is subtotal + this %.
const SERVICE_FEE_PCT = 12;
const withFee = (subtotal: number) => Math.round(subtotal * (1 + SERVICE_FEE_PCT / 100));

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five"][n] ?? String(n);
}

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
  const enquiryParam = searchParams.get("enquiry");
  const proposalParam = searchParams.get("proposal");
  // Resolved once loaded — either from ?enquiry, or from the proposal's own
  // enquiry_id when opened via ?proposal={id}.
  const [enquiryId, setEnquiryId] = useState<string | null>(enquiryParam);

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
  const [options, setOptions] = useState<VenueOption[] | null>(null);
  const [portfolio, setPortfolio] = useState<VenueWithPortfolio[] | null>(null);
  const [picked, setPicked] = useState<ProposalVenue[]>([]);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [venueView, setVenueView] = useState<"all" | "fits">("all");

  // Step 3 / 4 state
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [introCopy, setIntroCopy] = useState("");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [sending, setSending] = useState(false);
  const [proposalStatus, setProposalStatus] = useState("draft");
  const [emailCopy, setEmailCopy] = useState("");
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Guards against creating duplicate drafts. Set synchronously before any
  // await, so a second concurrent call (React StrictMode double-fires effects
  // in dev; a double-click could too) sees the enquiry is already being
  // handled and bails — the cause of the duplicate drafts seen in the list.
  const draftInitRef = useRef<string | null>(null);

  const ensureDraftProposal = useCallback(
    async (enq: Enquiry, latestBrief: Brief, orgName: string | null) => {
      if (draftInitRef.current === enq.id) return;
      draftInitRef.current = enq.id;
      try {
        const existing = await apiFetch<Proposal[]>(`/proposals?enquiry_id=${enq.id}`);
        // Newest draft first (the list is created_at desc) — reuse ONE draft
        // per enquiry. A sent proposal is never reused, so building again
        // after sending starts a fresh proposal (versioning).
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
      } catch (err) {
        draftInitRef.current = null; // allow a retry on failure
        throw err;
      }
    },
    [],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      // Opened on an existing proposal (?proposal={id}) → load it and use its
      // enquiry. Otherwise start from ?enquiry={id} and reuse/create a draft.
      let eid = enquiryParam;
      let existingProposal: Proposal | null = null;
      if (proposalParam) {
        existingProposal = await apiFetch<Proposal>(`/proposals/${proposalParam}`);
        eid = existingProposal.enquiry_id;
      }
      if (!eid) {
        setError("No enquiry or proposal specified.");
        return;
      }
      setEnquiryId(eid);

      const enq = await apiFetch<Enquiry>(`/enquiries/${eid}`);
      setEnquiry(enq);

      const briefs = await apiFetch<Brief[]>(`/enquiries/${eid}/briefs`);
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

      if (existingProposal) {
        setProposal(existingProposal);
      } else if (latest) {
        // The draft is the autosave target — only creatable once a brief
        // exists (proposals.brief_id is required).
        await ensureDraftProposal(enq, latest, orgName);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the proposal.");
    }
  }, [enquiryParam, proposalParam, ensureDraftProposal]);

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
    // Venue options price EVERY venue (fitting or not) + flag fit/recommended.
    // Can 422 if the brief lacks guests/date/duration — then you can still
    // browse the portfolio, just without fit/pricing info.
    try {
      setOptions(await apiFetch<VenueOption[]>(`/briefs/${brief.id}/venue-options`));
    } catch (err) {
      setOptions([]);
      if (err instanceof ApiError && err.status === 422) {
        setVenuesError(
          "Add guests, a date, and duration to the brief to price venues — you can still browse below.",
        );
      }
    }
  }, [brief, proposal]);

  useEffect(() => {
    if (step === 2) loadVenues();
  }, [step, loadVenues]);

  async function toggleVenue(venueId: string, option: VenueOption | undefined) {
    if (!proposal) return;
    const existing = picked.find((p) => p.venue_id === venueId);
    setTogglingId(venueId);
    setVenuesError(null);
    try {
      if (existing) {
        await apiFetch(`/proposals/${proposal.id}/venues/${existing.id}`, { method: "DELETE" });
        setPicked((prev) => prev.filter((p) => p.id !== existing.id));
      } else {
        // A venue can be picked regardless of fit — but attaching it to a
        // proposal still needs a pricing rule + computed quote. Only venues
        // with no pricing rule at all can't be added.
        if (!option?.pricing_rules_id || option.quote_breakdown == null || option.estimated_total == null) {
          setVenuesError(`${option?.venue_name ?? "This venue"} has no pricing rule yet — add one in Venues first.`);
          return;
        }
        if (picked.length >= 5) return;
        const created = await apiFetch<ProposalVenue>(`/proposals/${proposal.id}/venues`, {
          method: "POST",
          body: JSON.stringify({
            venue_id: option.venue_id,
            configuration_id: option.configuration_id,
            pricing_rules_id: option.pricing_rules_id,
            quote_breakdown: option.quote_breakdown,
            quote_total: option.estimated_total,
            sort_order: picked.length,
            recommended: option.recommended,
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

  // Keep Step 4's editable copy + status in sync when the draft loads/changes.
  useEffect(() => {
    if (!proposal) return;
    setIntroCopy(proposal.intro_copy ?? "");
    setEmailCopy(proposal.personal_email_copy ?? "");
    setProposalStatus(proposal.status);
    // Reload any existing shareable link so it survives reloads/revisits
    // (it was only ever held in local state before → looked "not saved").
    apiFetch<ProposalLinkToken[]>(`/proposals/${proposal.id}/links`)
      .then((links) => {
        const active = links.find((l) => !l.revoked);
        if (active) setShareToken(active.token);
      })
      .catch(() => {});
  }, [proposal]);

  async function overrideTotal(pv: ProposalVenue, value: number) {
    if (!proposal) return;
    setSavingOverride(pv.id);
    setVenuesError(null);
    try {
      const updated = await apiFetch<ProposalVenue>(
        `/proposals/${proposal.id}/venues/${pv.id}`,
        { method: "PATCH", body: JSON.stringify({ quote_total: value }) },
      );
      setPicked((prev) => prev.map((p) => (p.id === pv.id ? updated : p)));
    } catch (err) {
      setVenuesError(err instanceof ApiError ? err.message : "Couldn't save the override.");
    } finally {
      setSavingOverride(null);
    }
  }

  async function generateIntro() {
    if (!proposal) return;
    setGeneratingCopy(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposal.id}/generate-intro-copy`, {
        method: "POST",
      });
      setProposal(updated);
      setIntroCopy(updated.intro_copy ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft copy (AI may be unavailable).");
    } finally {
      setGeneratingCopy(false);
    }
  }

  async function saveIntro() {
    if (!proposal) return;
    setSavingCopy(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ intro_copy: introCopy }),
      });
      setProposal(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the copy.");
    } finally {
      setSavingCopy(false);
    }
  }

  async function createLink() {
    if (!proposal) return;
    setCreatingLink(true);
    setError(null);
    try {
      const link = await apiFetch<ProposalLinkToken>(`/proposals/${proposal.id}/links`, {
        method: "POST",
      });
      setShareToken(link.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the link.");
    } finally {
      setCreatingLink(false);
    }
  }

  async function markSent() {
    if (!proposal) return;
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposal.id}/send`, { method: "POST" });
      setProposalStatus(updated.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark as sent.");
    } finally {
      setSending(false);
    }
  }

  async function generateEmail() {
    if (!proposal) return;
    setGeneratingEmail(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposal.id}/generate-personal-email`, {
        method: "POST",
      });
      setProposal(updated);
      setEmailCopy(updated.personal_email_copy ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft the email (AI may be unavailable).");
    } finally {
      setGeneratingEmail(false);
    }
  }

  function openInGmail() {
    const to = encodeURIComponent(contact?.email ?? "");
    const su = encodeURIComponent(`Proposal — ${brief?.event_type ?? "your event"}`);
    const body = encodeURIComponent(emailCopy);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`, "_blank");
  }

  async function openPreview() {
    if (!proposal) return;
    setShowPreview(true);
    setPreviewHtml(null);
    try {
      setPreviewHtml(await apiFetchText(`/proposals/${proposal.id}/preview-html`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't render the preview.");
      setShowPreview(false);
    }
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Tracks whether the PDF's been downloaded at least once this session —
  // Gmail's compose-via-URL can't attach a file for you, so this drives
  // the "attach it before sending" reminder next to Open in Gmail below.
  const [hasDownloadedPdf, setHasDownloadedPdf] = useState(false);
  async function downloadPdf() {
    if (!proposal) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      await apiDownload(`/proposals/${proposal.id}/pdf`, `Proposal_${proposalRef.replace("#", "")}.pdf`);
      setHasDownloadedPdf(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't generate the PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

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
              Browse the portfolio and select 1 to 5 venues. The selection is always yours — the best-fitting venues sort
              first and the AI may flag a recommendation by feel, but nothing is blocked. Pick any venue by judgement.
            </p>

            {venuesError && (
              <p style={{ color: "var(--color-warning)", marginTop: "var(--space-4)" }}>{venuesError}</p>
            )}

            <div style={{ display: "flex", gap: "var(--space-5)", borderBottom: "1px solid var(--color-border)", marginTop: "var(--space-6)" }}>
              {([
                { key: "all" as const, label: "All venues", count: portfolio?.length ?? 0 },
                { key: "fits" as const, label: "Fits brief", count: options?.filter((o) => o.fits).length ?? 0 },
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
                  .map((v) => ({ v, option: options?.find((o) => o.venue_id === v.id) }))
                  .filter(({ option }) => venueView === "all" || option?.fits)
                  .sort((a, b) => (a.option?.sort_order ?? 999) - (b.option?.sort_order ?? 999))
                  .map(({ v, option }) => {
                    const selected = picked.some((p) => p.venue_id === v.id);
                    // Selectable regardless of fit; only truly unpriceable venues
                    // (no pricing rule) can't attach to a proposal.
                    const priceable = Boolean(
                      option?.pricing_rules_id && option?.quote_breakdown != null && option?.estimated_total != null,
                    );
                    const disabled = !selected && !priceable;
                    const hero = v.venue_media.find((m) => m.kind === "photo")?.url ?? v.venue_media[0]?.url ?? null;
                    const cap =
                      option?.capacity ??
                      (v.venue_configurations.length ? Math.max(...v.venue_configurations.map((c) => c.capacity)) : null);
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleVenue(v.id, option)}
                        disabled={disabled || togglingId === v.id}
                        title={disabled ? "No pricing rule set — add one in Venues first" : option?.fit_reasons.join(" · ")}
                        style={{
                          textAlign: "left",
                          padding: 0,
                          background: "var(--color-bg)",
                          border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.6 : 1,
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
                          <div style={{ position: "absolute", top: "var(--space-3)", left: "var(--space-3)", display: "flex", gap: "6px" }}>
                            {option?.recommended && (
                              <span style={{ ...TAG, background: "var(--color-brass)", color: "#fff" }}>✦ EV pick</span>
                            )}
                            {option?.fits ? (
                              <span style={{ ...TAG, background: "var(--color-accent)", color: "#fff" }}>Fits brief</span>
                            ) : (
                              option && (
                                <span style={{ ...TAG, background: "rgba(27,42,74,0.75)", color: "#fff" }}>
                                  {option.fit_reasons[0] ?? "Off-brief"}
                                </span>
                              )
                            )}
                          </div>
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
                            {option?.estimated_total != null && <span>HKD {option.estimated_total.toLocaleString()}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={EYEBROW}>Step 03 · Generate pricing</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.6rem", margin: "var(--space-3) 0 var(--space-2)" }}>
              Rules engine. <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>Your final word.</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "640px", marginTop: 0 }}>
              For each venue the engine reads its rule card and produces a transparent price — never the AI. Everything
              is editable: override a total by hand, or reset it back to the engine.
            </p>
            {venuesError && <p style={{ color: "var(--color-warning)" }}>{venuesError}</p>}

            {picked.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-6)" }}>
                No venues selected — go back to Step 2 to shortlist some.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-6)" }}>
                  {picked.map((pv, i) => {
                    const v = portfolio?.find((x) => x.id === pv.venue_id);
                    const hero =
                      v?.venue_media.find((m) => m.kind === "photo")?.url ?? v?.venue_media[0]?.url ?? null;
                    return (
                      <PricingCard
                        key={pv.id}
                        index={i + 1}
                        name={nameForVenue(pv.venue_id)}
                        location={v?.district ?? null}
                        heroUrl={hero}
                        pv={pv}
                        saving={savingOverride === pv.id}
                        onOverride={(value) => overrideTotal(pv, value)}
                      />
                    );
                  })}
                </div>

                <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)", marginTop: "var(--space-8)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: 0 }}>
                      All <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>{numberWord(picked.length)}</span> options priced
                    </h3>
                    <span style={{ fontSize: "0.75rem", fontStyle: "italic", color: "var(--color-text-muted)" }}>
                      Update freely — totals stay live
                    </span>
                  </div>
                  <div style={{ marginTop: "var(--space-4)" }}>
                    {picked.map((pv) => (
                      <div key={pv.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-3) 0", borderTop: "1px solid var(--color-border)" }}>
                        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.05rem" }}>
                          {nameForVenue(pv.venue_id)}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          HKD {pv.quote_total != null ? withFee(pv.quote_total).toLocaleString() : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={EYEBROW}>Step 04 · Generate &amp; share</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.6rem", margin: "var(--space-3) 0 var(--space-2)" }}>
              One click. <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>PDF ready to attach.</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "680px", marginTop: 0 }}>
              The branded proposal below <em>is</em> the PDF — &ldquo;Download PDF&rdquo; prints it. Draft the client note with
              AI, then open Gmail and attach the downloaded PDF before sending. (Sending directly from EV, with the PDF attached
              automatically, is a later SMTP/API decision.)
            </p>

            {/* Generated banner */}
            {picked.length > 0 &&
              (() => {
                const totals = picked
                  .map((p) => p.quote_total)
                  .filter((t): t is number => t != null)
                  .map(withFee);
                const lo = totals.length ? Math.min(...totals) : null;
                const hi = totals.length ? Math.max(...totals) : null;
                return (
                  <div style={{ background: "var(--color-navy)", color: "var(--color-navy-text)", padding: "var(--space-6) var(--space-8)", marginTop: "var(--space-6)" }}>
                    <div style={{ ...EYEBROW, color: "#fff", opacity: 0.7 }}>✓ Generated · ready to send</div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.9rem", marginTop: "var(--space-1)" }}>
                      Your proposal for{" "}
                      <span style={{ fontStyle: "italic", color: "#e0a3ad" }}>{clientName}</span> is live.
                    </div>
                    <div style={{ fontSize: "0.85rem", opacity: 0.75, marginTop: "var(--space-2)" }}>
                      Proposal {proposalRef} · {picked.length} {picked.length === 1 ? "venue" : "venues"}
                      {lo != null && hi != null ? ` · HKD ${lo.toLocaleString()} – ${hi.toLocaleString()}` : ""}
                    </div>
                  </div>
                );
              })()}

            {/* Deliverables — PDF leads: it's what actually goes to the
                client now (attached in Gmail), not the share link. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
              <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-accent)", padding: "var(--space-6)" }}>
                <div style={{ ...EYEBROW, color: "var(--color-accent)" }}>Deliverable · 01 · attach this</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "2px 0 var(--space-4)" }}>
                  PDF <span style={{ fontStyle: "italic" }}>document</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: "0 0 var(--space-4)" }}>
                  A branded, standard-format proposal document. Preview it exactly as the client will see it, then download and
                  attach it to the email below.
                </p>
                <div style={{ display: "flex", gap: "var(--space-3)" }}>
                  <button
                    type="button"
                    onClick={openPreview}
                    disabled={picked.length === 0}
                    style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: picked.length ? "pointer" : "not-allowed" }}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={downloadPdf}
                    disabled={picked.length === 0 || downloadingPdf}
                    style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-accent)", background: picked.length ? "var(--color-accent)" : "var(--color-surface)", color: picked.length ? "#fff" : "var(--color-text-muted)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: picked.length ? "pointer" : "not-allowed" }}
                  >
                    {downloadingPdf ? "Generating…" : hasDownloadedPdf ? "✓ Downloaded — download again" : "Download PDF"}
                  </button>
                </div>
              </div>

              <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)" }}>
                <div style={{ ...EYEBROW, color: "var(--color-text-muted)" }}>Deliverable · 02 · optional</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "2px 0 var(--space-4)" }}>
                  Web <span style={{ fontStyle: "italic" }}>proposal</span>
                </div>
                {shareToken ? (
                  <>
                    <code style={{ display: "block", padding: "var(--space-3)", background: "var(--color-surface)", fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {typeof window !== "undefined" ? window.location.origin : ""}/p/{shareToken}
                    </code>
                    <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/p/${shareToken}`)}
                        style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-navy)", background: "var(--color-navy)", color: "#fff", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
                      >
                        Copy link
                      </button>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "var(--space-3)" }}>
                      Public read-only page (G5) is still pending — the token + endpoint exist. The client note below no longer
                      mentions this link; the PDF is the primary deliverable now.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={createLink}
                    disabled={creatingLink}
                    style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-navy)", background: "var(--color-navy)", color: "#fff", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
                  >
                    {creatingLink ? "Creating…" : "Generate link"}
                  </button>
                )}
              </div>
            </div>

            {/* Email note */}
            <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)", marginTop: "var(--space-5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
                <div>
                  <div style={{ ...EYEBROW, color: "var(--color-accent)" }}>Send it</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", marginTop: "2px" }}>
                    A note to <span style={{ fontStyle: "italic" }}>{contact?.full_name?.split(" ")[0] ?? "the client"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={generateEmail}
                  disabled={generatingEmail}
                  style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-accent)", background: "var(--color-bg)", color: "var(--color-accent)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: generatingEmail ? "default" : "pointer" }}
                >
                  {generatingEmail ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <ThinkingOrb size={14} /> Drafting…
                    </span>
                  ) : (
                    "✦ Draft with AI"
                  )}
                </button>
              </div>
              <textarea
                value={emailCopy}
                onChange={(e) => setEmailCopy(e.target.value)}
                rows={8}
                placeholder="Concierge drafts a warm personal note here — review, edit, then send."
                style={{ width: "100%", padding: "var(--space-4)", border: "1px solid var(--color-border)", background: "var(--color-surface)", font: "inherit", resize: "vertical", lineHeight: 1.7, marginTop: "var(--space-4)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  To {contact?.email ?? "the client"} · status: {proposalStatus}
                </span>
                <div style={{ display: "flex", gap: "var(--space-3)" }}>
                  <button
                    type="button"
                    onClick={openInGmail}
                    style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
                  >
                    Open in Gmail ↗
                  </button>
                  <button
                    type="button"
                    onClick={markSent}
                    disabled={sending || proposalStatus === "sent"}
                    style={{ padding: "var(--space-3) var(--space-5)", border: "1px solid var(--color-accent)", background: proposalStatus === "sent" ? "var(--color-surface)" : "var(--color-accent)", color: proposalStatus === "sent" ? "var(--color-text-muted)" : "#fff", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: proposalStatus === "sent" ? "default" : "pointer" }}
                  >
                    {proposalStatus === "sent" ? "✓ Sent" : sending ? "Sending…" : "Mark as sent"}
                  </button>
                </div>
              </div>
              {/* Gmail's compose-via-URL can't attach a file — this is the
                  one manual step standing between "drafted" and "actually
                  has the PDF on it," so it's called out explicitly rather
                  than assumed. */}
              <p style={{ fontSize: "0.78rem", color: hasDownloadedPdf ? "var(--color-text-muted)" : "var(--color-accent)", marginTop: "var(--space-3)", marginBottom: 0 }}>
                {hasDownloadedPdf
                  ? "Reminder: Gmail can't attach the PDF for you — drag the file you downloaded above into the compose window before sending."
                  : "Download the PDF above first, then drag it into the Gmail window before sending — Gmail can't attach it for you."}
              </p>
            </div>

            {/* Preview = the exact PDF HTML in an iframe (one source of truth
                with the backend; Download PDF renders the same HTML server-side). */}
            {showPreview && (
              <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(16,20,40,0.9)", overflowY: "auto", padding: "var(--space-6) var(--space-4)" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPreview(false);
                    setPreviewHtml(null);
                  }}
                  style={{ position: "fixed", top: "var(--space-4)", right: "var(--space-4)", zIndex: 101, padding: "var(--space-3) var(--space-4)", background: "var(--color-bg)", border: "1px solid var(--color-border)", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
                >
                  × Close preview
                </button>
                {previewHtml ? (
                  <iframe
                    title="Proposal preview"
                    srcDoc={previewHtml}
                    style={{ display: "block", margin: "0 auto", width: "min(900px, 100%)", height: "92vh", border: "none", background: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
                  />
                ) : (
                  <div style={{ color: "#fff", textAlign: "center", paddingTop: "40vh" }}>Rendering preview…</div>
                )}
              </div>
            )}
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
            const label =
              step === 1
                ? "Continue to venues →"
                : step === 2
                  ? "Generate pricing →"
                  : "Generate proposal →";
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

/** One venue's quote as a reference-style "option" card: thumbnail + option
 * header + Priced/Locked status, a line-item breakdown beside a navy total
 * box, and a manual override (with reset-to-engine). The AI never touches
 * pricing — this is the deterministic rules-engine output. */
function PricingCard({
  index,
  name,
  location,
  heroUrl,
  pv,
  saving,
  onOverride,
}: {
  index: number;
  name: string;
  location: string | null;
  heroUrl: string | null;
  pv: ProposalVenue;
  saving: boolean;
  onOverride: (value: number) => void;
}) {
  const qb = pv.quote_breakdown as unknown as Partial<QuoteBreakdown>;
  const ccy = qb.currency ?? "HKD";
  const [override, setOverride] = useState(pv.quote_total?.toString() ?? "");
  const money = (n?: number | null) => (n == null ? "—" : `${ccy} ${Number(n).toLocaleString()}`);

  const rows: [string, string][] = [];
  if (qb.base_rate != null) rows.push(["Base rate", money(qb.base_rate)]);
  if (qb.per_head_total != null) rows.push(["Per-head total", money(qb.per_head_total)]);
  if (qb.day_adjustment_multiplier && qb.day_adjustment_multiplier !== 1)
    rows.push(["Day adjustment", `× ${qb.day_adjustment_multiplier}`]);
  if (qb.season_adjustment_multiplier && qb.season_adjustment_multiplier !== 1)
    rows.push(["Season adjustment", `× ${qb.season_adjustment_multiplier}`]);
  if (qb.duration_overtime_amount) rows.push(["Overtime", money(qb.duration_overtime_amount)]);
  if (qb.addons_total) rows.push(["Add-ons", money(qb.addons_total)]);
  if (qb.min_spend_applied) rows.push(["Minimum spend applied", "yes"]);

  const overridden = qb.total != null && pv.quote_total !== qb.total;
  const engineTotal = qb.total ?? null;

  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderLeft: `3px solid var(--color-accent)` }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-4) var(--space-6)" }}>
        <div style={{ width: "64px", height: "64px", flexShrink: 0, background: "var(--color-surface)", overflow: "hidden" }}>
          {heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...EYEBROW, color: "var(--color-accent)" }}>Option · {String(index).padStart(2, "0")}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem" }}>{name}</div>
          {location && <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>{location}</div>}
        </div>
        <span
          style={{
            ...TAG,
            background: overridden ? "var(--color-navy)" : "#e7efe7",
            color: overridden ? "#fff" : "#2f7a44",
            whiteSpace: "nowrap",
          }}
        >
          ● {overridden ? "Locked" : "Priced"}
        </span>
      </div>

      {/* Breakdown + navy total box */}
      <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--color-border)" }}>
        <div style={{ flex: "1 1 280px", padding: "var(--space-5) var(--space-6)" }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", fontSize: "0.9rem", color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)" }}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          {qb.addons && qb.addons.length > 0 && (
            <div style={{ padding: "var(--space-3) 0 var(--space-2)", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
              {qb.addons.map((a) => `${a.name} (${money(a.amount)})`).join(" · ")}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", fontSize: "0.9rem", fontWeight: 600, borderTop: "1px solid var(--color-border)" }}>
            <span>Venue subtotal</span>
            <span>{money(pv.quote_total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", fontSize: "0.85rem", color: "var(--color-accent)" }}>
            <span>EVA Service Fee · {SERVICE_FEE_PCT}%</span>
            <span>{money(Math.round((pv.quote_total ?? 0) * (SERVICE_FEE_PCT / 100)))}</span>
          </div>
        </div>
        <div style={{ flex: "0 0 200px", background: "var(--color-navy)", color: "var(--color-navy-text)", padding: "var(--space-5)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>Total</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.9rem", marginTop: "2px" }}>{money(withFee(pv.quote_total ?? 0))}</div>
          <div style={{ fontSize: "0.68rem", opacity: 0.6, marginTop: "4px" }}>incl. {SERVICE_FEE_PCT}% service fee{engineTotal != null && overridden ? " · overridden" : ""}</div>
        </div>
      </div>

      {/* Override / reset */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)", padding: "var(--space-4) var(--space-6)", borderTop: "1px solid var(--color-border)" }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...SECTION_LABEL, display: "block", marginBottom: "4px" }}>Final total ({ccy})</label>
          <input
            type="number"
            min="0"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--color-border)", background: "var(--color-bg)", font: "inherit" }}
          />
        </div>
        {engineTotal != null && (
          <button
            type="button"
            onClick={() => {
              setOverride(String(engineTotal));
              onOverride(engineTotal);
            }}
            disabled={saving}
            style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Reset to engine
          </button>
        )}
        <button
          type="button"
          onClick={() => override && onOverride(Number(override))}
          disabled={saving}
          style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "#fff", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {saving ? "Saving…" : "Lock price"}
        </button>
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
