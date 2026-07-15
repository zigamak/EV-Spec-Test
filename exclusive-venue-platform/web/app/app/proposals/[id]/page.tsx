"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Proposal, ProposalLinkToken, ProposalVenue } from "@/lib/api/types";

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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "90px",
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  resize: "vertical",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
  marginTop: "var(--space-5)",
};

/** Proposal editor (task G3): select venues (done in the command center's
 * "Create proposal from shortlist" flow, G0), adjust, edit copy. GPT copy
 * generation (G2) writes into the same plain, editable text fields a
 * human can rewrite freely — never authoritative. */
export default function ProposalEditorPage() {
  const params = useParams<{ id: string }>();
  const proposalId = params.id;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [venues, setVenues] = useState<ProposalVenue[]>([]);
  const [links, setLinks] = useState<ProposalLinkToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [introCopy, setIntroCopy] = useState("");
  const [savingIntro, setSavingIntro] = useState(false);
  const [generatingIntro, setGeneratingIntro] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const proposalData = await apiFetch<Proposal>(`/proposals/${proposalId}`);
      setProposal(proposalData);
      setIntroCopy(proposalData.intro_copy ?? "");
      const venueData = await apiFetch<ProposalVenue[]>(`/proposals/${proposalId}/venues`);
      setVenues(venueData);
      const linkData = await apiFetch<ProposalLinkToken[]>(`/proposals/${proposalId}/links`);
      setLinks(linkData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load proposal");
    }
  }, [proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveIntro() {
    setSavingIntro(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ intro_copy: introCopy }),
      });
      setProposal(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save intro copy");
    } finally {
      setSavingIntro(false);
    }
  }

  async function handleGenerateIntro() {
    setGeneratingIntro(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposalId}/generate-intro-copy`, {
        method: "POST",
      });
      setProposal(updated);
      setIntroCopy(updated.intro_copy ?? "");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotice("AI copy generation is unavailable — no OpenAI API key configured. Write the intro manually below.");
      } else {
        setError(err instanceof ApiError ? err.message : "Copy generation failed");
      }
    } finally {
      setGeneratingIntro(false);
    }
  }

  async function handleGenerateVenueCopy(proposalVenueId: string) {
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<ProposalVenue>(
        `/proposals/${proposalId}/venues/${proposalVenueId}/generate-copy`,
        { method: "POST" },
      );
      setVenues((prev) => prev.map((v) => (v.id === proposalVenueId ? updated : v)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotice("AI copy generation is unavailable — no OpenAI API key configured. Write venue copy manually below.");
      } else {
        setError(err instanceof ApiError ? err.message : "Copy generation failed");
      }
    }
  }

  async function handleSaveVenueCopy(proposalVenueId: string, venueCopy: string) {
    try {
      const updated = await apiFetch<ProposalVenue>(`/proposals/${proposalId}/venues/${proposalVenueId}`, {
        method: "PATCH",
        body: JSON.stringify({ venue_copy: venueCopy }),
      });
      setVenues((prev) => prev.map((v) => (v.id === proposalVenueId ? updated : v)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save venue copy");
    }
  }

  async function handleRemoveVenue(proposalVenueId: string) {
    try {
      await apiFetch(`/proposals/${proposalId}/venues/${proposalVenueId}`, { method: "DELETE" });
      setVenues((prev) => prev.filter((v) => v.id !== proposalVenueId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove venue");
    }
  }

  async function handleToggleRecommended(proposalVenueId: string, recommended: boolean) {
    try {
      const updated = await apiFetch<ProposalVenue>(`/proposals/${proposalId}/venues/${proposalVenueId}`, {
        method: "PATCH",
        body: JSON.stringify({ recommended }),
      });
      setVenues((prev) => prev.map((v) => (v.id === proposalVenueId ? updated : v)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update venue");
    }
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<Proposal>(`/proposals/${proposalId}/send`, { method: "POST" });
      setProposal(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send proposal");
    } finally {
      setSending(false);
    }
  }

  async function handleCreateLink() {
    setCreatingLink(true);
    setError(null);
    try {
      const link = await apiFetch<ProposalLinkToken>(`/proposals/${proposalId}/links`, { method: "POST" });
      setLinks((prev) => [link, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create link");
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleRevokeLink(tokenId: string) {
    try {
      const updated = await apiFetch<ProposalLinkToken>(`/proposals/${proposalId}/links/${tokenId}/revoke`, {
        method: "POST",
      });
      setLinks((prev) => prev.map((l) => (l.id === tokenId ? updated : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke link");
    }
  }

  if (error && !proposal) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "880px", margin: "0 auto" }}>
      <Link href={`/app/enquiries/${proposal.enquiry_id}`} style={{ color: "var(--color-text-secondary)" }}>
        ← Enquiry
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "var(--space-4)" }}>
        <h1 style={{ margin: 0 }}>{proposal.title}</h1>
        <span
          style={{
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            fontSize: "0.85rem",
          }}
        >
          {proposal.status}
        </span>
      </div>

      {notice && <p style={{ color: "var(--color-warning)", marginTop: "var(--space-4)" }}>{notice}</p>}
      {error && <p style={{ color: "var(--color-danger)", marginTop: "var(--space-4)" }}>{error}</p>}

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Intro copy</h2>
          <button style={buttonStyle} disabled={generatingIntro} onClick={handleGenerateIntro}>
            {generatingIntro ? "Generating…" : "Generate with AI"}
          </button>
        </div>
        <textarea
          style={{ ...textareaStyle, marginTop: "var(--space-3)" }}
          value={introCopy}
          onChange={(e) => setIntroCopy(e.target.value)}
        />
        <button style={{ ...primaryButtonStyle, marginTop: "var(--space-2)" }} disabled={savingIntro} onClick={handleSaveIntro}>
          {savingIntro ? "Saving…" : "Save"}
        </button>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Venues</h2>
        {venues.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No venues in this proposal yet.</p>
        ) : (
          venues.map((pv) => <ProposalVenueCard key={pv.id} proposalVenue={pv} onGenerateCopy={handleGenerateVenueCopy} onSaveCopy={handleSaveVenueCopy} onRemove={handleRemoveVenue} onToggleRecommended={handleToggleRecommended} />)
        )}
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Send &amp; share</h2>
          <button style={primaryButtonStyle} disabled={sending || proposal.status === "sent"} onClick={handleSend}>
            {sending ? "Sending…" : proposal.status === "sent" ? "Sent" : "Mark as sent"}
          </button>
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <button style={buttonStyle} disabled={creatingLink} onClick={handleCreateLink}>
            {creatingLink ? "Creating…" : "+ New shareable link"}
          </button>
          <ul style={{ listStyle: "none", padding: 0, marginTop: "var(--space-3)" }}>
            {links.map((link) => (
              <li
                key={link.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                  {link.token}
                  {link.revoked && <span style={{ color: "var(--color-danger)" }}> (revoked)</span>}
                </span>
                {!link.revoked && (
                  <button style={buttonStyle} onClick={() => handleRevokeLink(link.id)}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function ProposalVenueCard({
  proposalVenue,
  onGenerateCopy,
  onSaveCopy,
  onRemove,
  onToggleRecommended,
}: {
  proposalVenue: ProposalVenue;
  onGenerateCopy: (id: string) => Promise<void>;
  onSaveCopy: (id: string, copy: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onToggleRecommended: (id: string, recommended: boolean) => Promise<void>;
}) {
  const [copy, setCopy] = useState(proposalVenue.venue_copy ?? "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCopy(proposalVenue.venue_copy ?? "");
  }, [proposalVenue.venue_copy]);

  async function handleGenerate() {
    setGenerating(true);
    await onGenerateCopy(proposalVenue.id);
    setGenerating(false);
  }

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Link href={`/app/venues/${proposalVenue.venue_id}`} style={{ color: "var(--color-accent)", fontWeight: 600 }}>
            View venue
          </Link>
          <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            HK${proposalVenue.quote_total.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <input
              type="checkbox"
              checked={proposalVenue.recommended}
              onChange={(e) => onToggleRecommended(proposalVenue.id, e.target.checked)}
            />
            Recommended
          </label>
          <button style={buttonStyle} onClick={() => onRemove(proposalVenue.id)}>
            Remove
          </button>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Venue copy</span>
          <button style={buttonStyle} disabled={generating} onClick={handleGenerate}>
            {generating ? "Generating…" : "Generate with AI"}
          </button>
        </div>
        <textarea style={{ ...textareaStyle, marginTop: "var(--space-2)" }} value={copy} onChange={(e) => setCopy(e.target.value)} />
        <button
          style={{ ...buttonStyle, marginTop: "var(--space-2)" }}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSaveCopy(proposalVenue.id, copy);
            setSaving(false);
          }}
        >
          {saving ? "Saving…" : "Save copy"}
        </button>
      </div>
    </div>
  );
}
