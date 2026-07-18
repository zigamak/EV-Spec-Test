"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  ENQUIRY_STAGES,
  STAGE_LABEL,
  type Brief,
  type BriefUpdate,
  type BudgetBasis,
  type Contact,
  type Enquiry,
  type EnquiryStage,
  type Proposal,
  type ShortlistResponse,
} from "@/lib/api/types";

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
  fontSize: "0.8rem",
  color: "var(--color-text-secondary)",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
  marginTop: "var(--space-5)",
};

const buttonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "var(--color-accent)",
  color: "#fff",
  border: "none",
};

/** Unified enquiry command center (tasks G0 + D4 + H2's detail view):
 * raw message, stage/assignment controls, editable parsed brief, and the
 * recommended + priced venue shortlist — all in one place, before a
 * proposal gets built. AI calls (parse, re-rank) degrade to a clear
 * message rather than a crash when OPENAI_API_KEY isn't configured. */
export default function EnquiryCommandCenterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const enquiryId = params.id;

  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [parsing, setParsing] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [shortlist, setShortlist] = useState<ShortlistResponse | null>(null);
  const [loadingShortlist, setLoadingShortlist] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const enquiryData = await apiFetch<Enquiry>(`/enquiries/${enquiryId}`);
      setEnquiry(enquiryData);
      const briefData = await apiFetch<Brief[]>(`/enquiries/${enquiryId}/briefs`);
      setBriefs(briefData);
      if (enquiryData.contact_id) {
        const contactData = await apiFetch<Contact>(`/contacts/${enquiryData.contact_id}`).catch(
          () => null,
        );
        setContact(contactData);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load enquiry");
    }
  }, [enquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  const latestBrief = briefs[0] ?? null;

  async function handleTransition(stage: EnquiryStage) {
    setTransitioning(true);
    setError(null);
    try {
      let lostReason: string | null = null;
      if (stage === "lost") {
        lostReason = window.prompt("Reason the enquiry was lost:");
        if (!lostReason) {
          setTransitioning(false);
          return;
        }
      }
      const updated = await apiFetch<Enquiry>(`/enquiries/${enquiryId}/transition`, {
        method: "POST",
        body: JSON.stringify({ stage, lost_reason: lostReason }),
      });
      setEnquiry(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Stage transition failed");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleParse() {
    setParsing(true);
    setError(null);
    setNotice(null);
    try {
      const brief = await apiFetch<Brief>(`/enquiries/${enquiryId}/briefs/parse`, { method: "POST" });
      setBriefs((prev) => [brief, ...prev]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotice("AI parsing is unavailable — no OpenAI API key configured in this environment.");
      } else {
        setError(err instanceof ApiError ? err.message : "Parse failed");
      }
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveBrief(update: BriefUpdate) {
    if (!latestBrief) return;
    setSavingBrief(true);
    setError(null);
    try {
      const updated = await apiFetch<Brief>(`/enquiries/${enquiryId}/briefs/${latestBrief.id}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      });
      setBriefs((prev) => [updated, ...prev.slice(1)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save brief");
    } finally {
      setSavingBrief(false);
    }
  }

  async function handleLoadShortlist(rerank: boolean) {
    if (!latestBrief) return;
    setLoadingShortlist(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<ShortlistResponse>(
        `/briefs/${latestBrief.id}/shortlist${rerank ? "?rerank=true" : ""}`,
      );
      setShortlist(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotice("AI re-rank is unavailable — no OpenAI API key configured. Showing the deterministic order instead.");
        const fallback = await apiFetch<ShortlistResponse>(`/briefs/${latestBrief.id}/shortlist`);
        setShortlist(fallback);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to build shortlist");
      }
    } finally {
      setLoadingShortlist(false);
    }
  }

  async function handleCreateProposal() {
    if (!latestBrief || !shortlist || shortlist.shortlist.length === 0) return;
    setCreatingProposal(true);
    setError(null);
    try {
      const proposal = await apiFetch<Proposal>("/proposals", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: enquiryId,
          brief_id: latestBrief.id,
          title: `Proposal for ${contact?.full_name ?? "client"}${latestBrief.event_type ? ` — ${latestBrief.event_type}` : ""}`,
        }),
      });

      await Promise.all(
        shortlist.shortlist
          .filter((entry) => entry.pricing_rules_id && entry.quote_breakdown)
          .map((entry, i) =>
            apiFetch(`/proposals/${proposal.id}/venues`, {
              method: "POST",
              body: JSON.stringify({
                venue_id: entry.venue_id,
                configuration_id: entry.configuration_id,
                pricing_rules_id: entry.pricing_rules_id,
                quote_breakdown: entry.quote_breakdown,
                quote_total: entry.estimated_total,
                sort_order: i,
                recommended: i === 0,
              }),
            }),
          ),
      );

      router.push(`/app/proposals/${proposal.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create proposal");
      setCreatingProposal(false);
    }
  }

  if (error && !enquiry) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!enquiry) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "880px", margin: "0 auto" }}>
      <Link href="/app" style={{ color: "var(--color-text-secondary)" }}>
        ← Pipeline Board
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "var(--space-4)" }}>
        <div>
          <h1 style={{ margin: 0 }}>{contact?.full_name ?? "Enquiry"}</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "var(--space-1) 0 0" }}>
            {contact?.email ?? "No contact linked"} · {enquiry.channel}
          </p>
        </div>
        <span
          style={{
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            fontSize: "0.85rem",
          }}
        >
          {STAGE_LABEL[enquiry.stage]}
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
        {ENQUIRY_STAGES.filter((s) => s !== enquiry.stage).map((stage) => (
          <button key={stage} disabled={transitioning} style={buttonStyle} onClick={() => handleTransition(stage)}>
            → {STAGE_LABEL[stage]}
          </button>
        ))}
        {enquiry.stage !== "lost" && (
          <button disabled={transitioning} style={buttonStyle} onClick={() => handleTransition("lost")}>
            Mark lost
          </button>
        )}
      </div>

      {enquiry.lost_reason && (
        <p style={{ color: "var(--color-danger)", marginTop: "var(--space-2)" }}>
          Lost: {enquiry.lost_reason}
        </p>
      )}

      {notice && (
        <p style={{ color: "var(--color-warning)", marginTop: "var(--space-4)" }}>{notice}</p>
      )}
      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>}

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Raw enquiry</h2>
        <p style={{ whiteSpace: "pre-wrap", color: "var(--color-text-secondary)" }}>
          {enquiry.raw_content}
        </p>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
            Parsed brief {latestBrief ? `(v${latestBrief.version})` : ""}
          </h2>
          <button style={buttonStyle} disabled={parsing} onClick={handleParse}>
            {parsing ? "Parsing…" : latestBrief ? "Re-parse" : "Parse with AI"}
          </button>
        </div>

        {latestBrief ? (
          <BriefEditor brief={latestBrief} saving={savingBrief} onSave={handleSaveBrief} />
        ) : (
          <p style={{ color: "var(--color-text-muted)" }}>No brief yet — parse the raw enquiry above.</p>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Venue shortlist</h2>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button style={buttonStyle} disabled={!latestBrief || loadingShortlist} onClick={() => handleLoadShortlist(false)}>
              {loadingShortlist ? "Loading…" : "Build shortlist"}
            </button>
            <button style={buttonStyle} disabled={!latestBrief || loadingShortlist} onClick={() => handleLoadShortlist(true)}>
              Re-rank with AI
            </button>
          </div>
        </div>

        {!latestBrief && (
          <p style={{ color: "var(--color-text-muted)" }}>Parse a brief first — the shortlist needs guest count, date, and duration.</p>
        )}

        {shortlist && (
          <div style={{ marginTop: "var(--space-3)" }}>
            {shortlist.shortlist.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)" }}>No venues fit this brief.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "var(--space-2)" }}>Venue</th>
                    <th style={{ padding: "var(--space-2)" }}>Layout</th>
                    <th style={{ padding: "var(--space-2)" }}>Capacity</th>
                    <th style={{ padding: "var(--space-2)" }}>Estimated total</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlist.shortlist.map((entry) => (
                    <tr key={entry.venue_id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "var(--space-2)" }}>
                        <Link href={`/app/venues/${entry.venue_id}`} style={{ color: "var(--color-accent)" }}>
                          {entry.venue_name}
                        </Link>
                      </td>
                      <td style={{ padding: "var(--space-2)" }}>{entry.configuration_name}</td>
                      <td style={{ padding: "var(--space-2)" }}>{entry.capacity}</td>
                      <td style={{ padding: "var(--space-2)" }}>
                        {entry.estimated_total !== null ? `HK$${entry.estimated_total.toLocaleString()}` : "—"}
                        {entry.within_budget === false && (
                          <span style={{ color: "var(--color-danger)" }}> (over budget)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {shortlist.shortlist.length > 0 && (
              <button
                style={{ ...primaryButtonStyle, marginTop: "var(--space-3)" }}
                disabled={creatingProposal}
                onClick={handleCreateProposal}
              >
                {creatingProposal ? "Creating proposal…" : "Create proposal from shortlist"}
              </button>
            )}

            {shortlist.excluded.length > 0 && (
              <details style={{ marginTop: "var(--space-4)" }}>
                <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>
                  {shortlist.excluded.length} venue(s) excluded
                </summary>
                <ul style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {shortlist.excluded.map((ex) => (
                    <li key={ex.venue_id}>
                      {ex.venue_name} — {ex.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function BriefEditor({
  brief,
  saving,
  onSave,
}: {
  brief: Brief;
  saving: boolean;
  onSave: (update: BriefUpdate) => Promise<void>;
}) {
  const [dateWindowStart, setDateWindowStart] = useState(brief.date_window_start ?? "");
  const [dateWindowEnd, setDateWindowEnd] = useState(brief.date_window_end ?? "");
  const [guestCount, setGuestCount] = useState(brief.guest_count?.toString() ?? "");
  const [eventType, setEventType] = useState(brief.event_type ?? "");
  const [budgetAmount, setBudgetAmount] = useState(brief.budget_amount?.toString() ?? "");
  const [budgetBasis, setBudgetBasis] = useState<BudgetBasis | "">(brief.budget_basis ?? "");
  const [durationHours, setDurationHours] = useState(brief.duration_hours?.toString() ?? "");
  const [location, setLocation] = useState(brief.location_preference ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({
      date_window_start: dateWindowStart || null,
      date_window_end: dateWindowEnd || null,
      guest_count: guestCount ? Number(guestCount) : null,
      event_type: eventType || null,
      budget_amount: budgetAmount ? Number(budgetAmount) : null,
      budget_basis: budgetBasis || null,
      budget_status: budgetAmount ? "confirmed" : brief.budget_status,
      duration_hours: durationHours ? Number(durationHours) : null,
      location_preference: location || null,
    });
  }

  async function handleApprove() {
    await onSave({});
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <span
          style={{
            fontSize: "0.8rem",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
          }}
        >
          {brief.review_status.replace(/_/g, " ")} · confidence {(brief.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div>
          <label style={labelStyle}>Date window (start)</label>
          <input
            type="date"
            style={inputStyle}
            value={dateWindowStart}
            onChange={(e) => setDateWindowStart(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Date window (end)</label>
          <input
            type="date"
            style={inputStyle}
            value={dateWindowEnd}
            onChange={(e) => setDateWindowEnd(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Guest count</label>
          <input type="number" min={1} style={inputStyle} value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Event type</label>
          <input style={inputStyle} value={eventType} onChange={(e) => setEventType(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Duration (hours)</label>
          <input type="number" min={1} style={inputStyle} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Budget amount</label>
          <input type="number" min={0} style={inputStyle} value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Budget basis</label>
          <select style={inputStyle} value={budgetBasis} onChange={(e) => setBudgetBasis(e.target.value as BudgetBasis | "")}>
            <option value="">—</option>
            <option value="total">Total</option>
            <option value="per_head">Per head</option>
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Location preference</label>
          <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button type="submit" disabled={saving} style={primaryButtonStyle}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {brief.review_status !== "human_approved" && (
          <button type="button" disabled={saving} style={buttonStyle} onClick={handleApprove}>
            Approve as-is
          </button>
        )}
      </div>
    </form>
  );
}
