"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  type Brief,
  type Contact,
  type EnquiryStatus,
  type EnquiryWithBriefs,
  type Organisation,
  type OrganisationTier,
} from "@/lib/api/types";
import { relativeTime } from "@/lib/utils";
import ForwardToModal from "./ForwardToModal";

/**
 * Inquiries — the inbox (task C5), the three-column operator layout from the
 * reference design: sidebar (app shell) · this list · this detail panel.
 * Leads with the enquiry because every downstream surface hangs off one.
 *
 * Everything shown is real: org/contact come from GET /contacts +
 * /organisations joined to each enquiry client-side; tier/pax/date/budget
 * from the latest brief. Fields the reference mockup shows that we don't
 * model yet (a parent brand group like "LVMH", a contact job title) are
 * simply omitted rather than invented.
 */

type StatusTab = EnquiryStatus | "all";

const TABS: { key: StatusTab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "awaiting", label: "Awaiting" },
  { key: "won", label: "Won" },
  { key: "all", label: "All" },
];

const TIER_TAG: Record<OrganisationTier, React.CSSProperties> = {
  "tier-1": { background: "var(--color-accent)", color: "#fff" },
  "tier-2": { background: "var(--color-navy)", color: "#fff" },
  standard: { background: "var(--color-surface)", color: "var(--color-text-secondary)" },
};

// Colour-coded intake channel so it reads at a glance which surface an
// enquiry arrived on. Keys match EnquiryChannel.
const CHANNEL_META: Record<string, { label: string; bg: string; color: string }> = {
  whatsapp: { label: "WhatsApp", bg: "#1fa855", color: "#fff" },
  email: { label: "Email", bg: "#2f6fb0", color: "#fff" },
  web_form: { label: "Website", bg: "var(--color-navy)", color: "#fff" },
  manual: { label: "Manual", bg: "#8a8f99", color: "#fff" },
  concierge: { label: "Concierge", bg: "var(--color-brass)", color: "#fff" },
};

function channelMeta(channel: string) {
  return CHANNEL_META[channel] ?? { label: channel, bg: "var(--color-surface)", color: "var(--color-text-secondary)" };
}

const EYEBROW: React.CSSProperties = {
  fontSize: "0.62rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-accent)",
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

const CHIP: React.CSSProperties = {
  ...TAG,
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  fontWeight: 600,
};

function todayEyebrow(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const rest = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${weekday} · ${rest}`.toUpperCase();
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
  return null;
}

interface Row {
  enquiry: EnquiryWithBriefs;
  brief: Brief | null;
  contact: Contact | null;
  org: Organisation | null;
  title: string;
}

export default function InquiriesInboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StatusTab>("open");
  const [assign, setAssign] = useState<"all" | "unassigned" | "assigned">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ enquiries: EnquiryWithBriefs[]; contacts: Contact[]; organisations: Organisation[] }>(
      "/enquiries/inbox",
    )
      .then(({ enquiries, contacts, organisations: orgs }) => {
        if (cancelled) return;
        const contactsById = new Map(contacts.map((c) => [c.id, c]));
        const orgsById = new Map(orgs.map((o) => [o.id, o]));
        const built = enquiries.map((enquiry) => {
          const brief = [...enquiry.briefs].sort((a, b) => b.version - a.version)[0] ?? null;
          const contact = enquiry.contact_id ? contactsById.get(enquiry.contact_id) ?? null : null;
          const org = contact?.organisation_id ? orgsById.get(contact.organisation_id) ?? null : null;
          const title = org?.name ?? contact?.full_name ?? "Untitled enquiry";
          return { enquiry, brief, contact, org, title };
        });
        setRows(built);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load inquiries");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { open: 0, awaiting: 0, won: 0, lost: 0, all: 0 };
    for (const r of rows ?? []) {
      c.all += 1;
      c[r.enquiry.status] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const list = (rows ?? []).filter((r) => {
      if (tab !== "all" && r.enquiry.status !== tab) return false;
      if (assign === "unassigned" && r.enquiry.forwarded_to) return false;
      if (assign === "assigned" && !r.enquiry.forwarded_to) return false;
      return true;
    });
    return list.sort((a, b) => (a.enquiry.updated_at < b.enquiry.updated_at ? 1 : -1));
  }, [rows, tab, assign]);

  const selected = useMemo(
    () => visible.find((r) => r.enquiry.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  return (
    <main style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Middle — the inbox list */}
      <section
        style={{
          flex: "0 0 clamp(360px, 38%, 520px)",
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "var(--space-8) var(--space-8) var(--space-4)" }}>
          <div style={EYEBROW}>{todayEyebrow()}</div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "2.4rem",
              margin: "var(--space-2) 0 var(--space-5)",
            }}
          >
            Inbox
          </h1>

          <div style={{ display: "flex", gap: "var(--space-5)", borderBottom: "1px solid var(--color-border)" }}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
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
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "0.9rem" }}>
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            {(["all", "unassigned", "assigned"] as const).map((a) => {
              const active = assign === a;
              return (
                <button
                  key={a}
                  onClick={() => setAssign(a)}
                  style={{
                    padding: "2px var(--space-3)",
                    borderRadius: "var(--radius-pill)",
                    border: active
                      ? `1px solid ${a === "unassigned" ? "var(--color-accent)" : "var(--color-navy)"}`
                      : "1px solid var(--color-border)",
                    background: active ? "var(--color-surface)" : "var(--color-bg)",
                    cursor: "pointer",
                    fontSize: "0.68rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontWeight: active ? 700 : 500,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {error && <p style={{ color: "var(--color-danger)", padding: "0 var(--space-8)" }}>{error}</p>}
          {!error && rows === null && (
            <p style={{ color: "var(--color-text-muted)", padding: "0 var(--space-8)" }}>Loading…</p>
          )}
          {rows !== null && visible.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", padding: "0 var(--space-8)" }}>
              No {tab === "all" ? "" : tab} inquiries.
            </p>
          )}

          {visible.map((r) => {
            const active = selected?.enquiry.id === r.enquiry.id;
            const window = formatWindow(r.brief);
            return (
              <button
                key={r.enquiry.id}
                onClick={() => setSelectedId(r.enquiry.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                  background: active ? "var(--color-surface)" : "transparent",
                  cursor: "pointer",
                  padding: "var(--space-5) var(--space-8)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  {r.org?.tier ? (
                    <span style={{ ...TAG, ...TIER_TAG[r.org.tier] }}>{r.org.name}</span>
                  ) : (
                    <span style={{ ...TAG, background: channelMeta(r.enquiry.channel).bg, color: channelMeta(r.enquiry.channel).color }}>
                      {channelMeta(r.enquiry.channel).label}
                    </span>
                  )}
                  <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    {relativeTime(r.enquiry.updated_at)}
                  </span>
                </div>

                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", marginTop: "var(--space-2)" }}>
                  {r.title}
                </div>
                {r.brief?.event_type && (
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", marginTop: "2px" }}>{r.brief.event_type}</div>
                )}

                <p
                  style={{
                    color: "var(--color-text-secondary)",
                    fontSize: "0.85rem",
                    margin: "var(--space-2) 0 var(--space-3)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {r.enquiry.raw_content}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {r.org?.tier && (
                    <span style={{ ...CHIP, background: channelMeta(r.enquiry.channel).bg, color: channelMeta(r.enquiry.channel).color }}>
                      {channelMeta(r.enquiry.channel).label}
                    </span>
                  )}
                  {r.org?.tier && <span style={{ ...CHIP }}>{r.org.tier}</span>}
                  {r.brief?.guest_count && (
                    <span style={CHIP}>
                      {r.brief.guest_count} pax
                      {r.brief.duration_hours ? ` · ${r.brief.duration_hours}h` : ""}
                    </span>
                  )}
                  {(r.org?.region || r.brief?.location_preference) && (
                    <span style={CHIP}>{r.org?.region ?? r.brief?.location_preference}</span>
                  )}
                  {window && <span style={CHIP}>{window}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Right — the detail panel */}
      <section style={{ flex: 1, overflowY: "auto", background: "var(--color-surface)", minWidth: 0 }}>
        {selected ? (
          <DetailPanel row={selected} />
        ) : (
          rows !== null && (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-muted)",
              }}
            >
              Select an inquiry to view it.
            </div>
          )
        )}
      </section>
    </main>
  );
}

function DetailPanel({ row }: { row: Row }) {
  const { enquiry, brief, contact, org } = row;
  const window = formatWindow(brief);
  const budget = budgetLine(brief);
  const [showForward, setShowForward] = useState(false);
  const [forwardedTo, setForwardedTo] = useState<string | null>(enquiry.forwarded_to);

  const metaParts = [
    contact?.full_name,
    org?.name,
    brief?.guest_count ? `${brief.guest_count} pax` : null,
    window,
  ].filter(Boolean);

  const secondaryBtn: React.CSSProperties = {
    padding: "var(--space-3) var(--space-4)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-navy)",
    fontSize: "0.68rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "center",
  };

  return (
    <div style={{ padding: "var(--space-10)", maxWidth: "760px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span style={EYEBROW}>Inquiry · received {relativeTime(enquiry.created_at)} ago</span>
        <span style={{ ...TAG, background: channelMeta(enquiry.channel).bg, color: channelMeta(enquiry.channel).color }}>
          {channelMeta(enquiry.channel).label}
        </span>
      </div>

      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: "2.6rem",
          lineHeight: 1.1,
          margin: "var(--space-3) 0 var(--space-4)",
        }}
      >
        {brief?.event_type ?? "Enquiry"}
        {org && (
          <>
            {" "}
            <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>for {org.name}</span>
          </>
        )}
      </h2>

      {metaParts.length > 0 && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "1.05rem", margin: 0 }}>
          {metaParts.join(" · ")}
        </p>
      )}
      {budget && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", margin: "var(--space-1) 0 0" }}>
          {budget}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", margin: "var(--space-6) 0 var(--space-8)" }}>
        <button type="button" style={secondaryBtn}>
          Decline politely
        </button>
        <button
          type="button"
          onClick={() => setShowForward(true)}
          style={forwardedTo ? { ...secondaryBtn, borderColor: "var(--color-accent)", color: "var(--color-accent)" } : secondaryBtn}
        >
          {forwardedTo ? `Forwarded · ${forwardedTo}` : "Forward to →"}
        </button>
        <Link
          href={`/app/proposals/new?enquiry=${enquiry.id}`}
          style={{
            ...secondaryBtn,
            background: "var(--color-accent)",
            color: "#fff",
            border: "1px solid var(--color-accent)",
          }}
        >
          Build proposal →
        </Link>
      </div>

      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem" }}>
          {brief?.event_type ?? "Enquiry"}
          {window ? ` — ${window}` : ""}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
            margin: "var(--space-2) 0 var(--space-5)",
            paddingBottom: "var(--space-4)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          From <strong style={{ color: "var(--color-text-secondary)" }}>{contact?.full_name ?? "Unknown"}</strong>
          {contact?.email ? ` · ${contact.email}` : ""} · {enquiry.channel}
        </div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--color-text-primary)", margin: 0 }}>
          {enquiry.raw_content}
        </p>
      </div>

      {showForward && (
        <ForwardToModal
          enquiryId={enquiry.id}
          headline={brief?.event_type ?? "Enquiry"}
          subtitle={[org?.name, contact?.full_name, brief?.guest_count ? `${brief.guest_count} pax` : null].filter(Boolean).join(" · ")}
          current={forwardedTo}
          onClose={() => setShowForward(false)}
          onForwarded={(name) => {
            setForwardedTo(name);
            setShowForward(false);
          }}
        />
      )}
    </div>
  );
}
