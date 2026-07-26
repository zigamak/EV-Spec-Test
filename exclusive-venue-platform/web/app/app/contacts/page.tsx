"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  CONTACT_SOURCE_LABEL,
  ORGANISATION_KIND_LABEL,
  ORGANISATION_KINDS,
  ORGANISATION_TIER_LABEL,
  ORGANISATION_TIERS,
  type Contact,
  type ContactCreate,
  type ContactSource,
  type ContactSummary,
  type ContactUpdate,
  type DealStats,
  type Organisation,
  type OrganisationCreate,
  type OrganisationKind,
  type OrganisationSummary,
  type OrganisationTier,
  type OrganisationUpdate,
  type TimelineCategory,
  type TimelineEntry,
} from "@/lib/api/types";
import { avatarColorForId, relativeTime } from "@/lib/utils";

type Tab = "all" | "brands" | "people";
type Selection = { type: "org"; id: string } | { type: "contact"; id: string } | null;

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
  fontSize: "0.75rem",
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMoney(amount: number, currency: string | null): string {
  if (amount <= 0) return "—";
  return `${currency ?? "HKD"} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Renders a name with its last word in italic serif — the reference's
 * "House of *Dior*" / "Louis *Vuitton*" treatment. Single-word names
 * render plain (nothing to split off). */
function StyledName({ name }: { name: string }) {
  const words = name.split(" ");
  if (words.length < 2) return <>{name}</>;
  const last = words.pop();
  return (
    <>
      {words.join(" ")} <em style={{ fontStyle: "italic" }}>{last}</em>
    </>
  );
}

function AutoImportedBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.03em",
        color: "var(--color-success)",
      }}
    >
      ◆ AUTO-IMPORTED
    </span>
  );
}

/** Contacts directory (task, 19 Jul) — brands (organisations) and people
 * (contacts) in one searchable list with a detail panel: real computed
 * stats (enquiry/signed counts, revenue, last contact — no new columns,
 * same pattern erd.md already established for organisation lifetime
 * value), org-level website/address/notes, and contact job titles.
 * Distinct from the older /app/clients (a bare read-only contact table,
 * task J1) — this supersedes it for browsing, but that page is left as
 * is rather than deleted unprompted. */
export default function ContactsDirectoryPage() {
  const [organisations, setOrganisations] = useState<Organisation[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [selection, setSelection] = useState<Selection>(null);
  const [creating, setCreating] = useState<"org" | "contact" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { organisations: orgData, contacts: contactData } = await apiFetch<{
        organisations: Organisation[];
        contacts: Contact[];
      }>("/contacts-directory");
      setOrganisations(orgData);
      setContacts(contactData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load contacts");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orgById = useMemo(() => new Map((organisations ?? []).map((o) => [o.id, o])), [organisations]);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = organisations ?? [];
    if (!q) return list;
    return list.filter((o) => o.name.toLowerCase().includes(q) || o.region?.toLowerCase().includes(q));
  }, [organisations, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        orgById.get(c.organisation_id ?? "")?.name.toLowerCase().includes(q),
    );
  }, [contacts, search, orgById]);

  const totalCount = (organisations?.length ?? 0) + contacts.length;

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: "380px", flexShrink: 0, borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "var(--space-6) var(--space-6) var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem" }}>
              Contacts · <em style={{ color: "var(--color-accent)" }}>directory</em>
            </h1>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{totalCount} contacts</span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "var(--space-2) 0 var(--space-4)" }}>
            Every brand and person across your enquiries — auto-populated on intake, or added by hand.
          </p>

          <input
            placeholder="Search name, brand, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, borderRadius: "var(--radius-pill)" }}
          />

          <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
            {(["all", "brands", "people"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${tab === t ? "var(--color-accent)" : "transparent"}`,
                  padding: "0 0 var(--space-2)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: tab === t ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
              >
                {t === "all" ? `All ${totalCount}` : t === "brands" ? `Brands ${organisations?.length ?? 0}` : `People ${contacts.length}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 var(--space-4) var(--space-6)" }}>
          {organisations === null && <p style={{ padding: "0 var(--space-2)", color: "var(--color-text-muted)" }}>Loading…</p>}

          {(tab === "all" || tab === "brands") && filteredOrgs.length > 0 && (
            <>
              <SectionHeading>Brands · {filteredOrgs.length}</SectionHeading>
              {filteredOrgs.map((org) => (
                <ListRow
                  key={org.id}
                  active={selection?.type === "org" && selection.id === org.id}
                  onClick={() => setSelection({ type: "org", id: org.id })}
                  avatarLetter={initials(org.name)}
                  avatarColor={avatarColorForId(org.id)}
                  title={<StyledName name={org.name} />}
                  subtitle={[ORGANISATION_KIND_LABEL[org.kind], org.region].filter(Boolean).join(" · ")}
                  tag="BRAND"
                />
              ))}
            </>
          )}

          {(tab === "all" || tab === "people") && filteredContacts.length > 0 && (
            <>
              <SectionHeading>People · {filteredContacts.length}</SectionHeading>
              {filteredContacts.map((c) => (
                <ListRow
                  key={c.id}
                  active={selection?.type === "contact" && selection.id === c.id}
                  onClick={() => setSelection({ type: "contact", id: c.id })}
                  avatarLetter={initials(c.full_name)}
                  avatarColor={avatarColorForId(c.id)}
                  title={c.full_name}
                  subtitle={[c.role, orgById.get(c.organisation_id ?? "")?.name].filter(Boolean).join(" · ") || "—"}
                />
              ))}
            </>
          )}

          {organisations !== null && filteredOrgs.length === 0 && filteredContacts.length === 0 && (
            <p style={{ padding: "0 var(--space-2)", color: "var(--color-text-muted)" }}>No matches.</p>
          )}
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={() => setCreating("org")} style={ghostButtonStyle}>
            + New brand
          </button>
          <button onClick={() => setCreating("contact")} style={ghostButtonStyle}>
            + New contact
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {creating === "org" && (
          <CreateOrgPanel
            onCancel={() => setCreating(null)}
            onCreated={(org) => {
              setOrganisations((prev) => [...(prev ?? []), org].sort((a, b) => a.name.localeCompare(b.name)));
              setSelection({ type: "org", id: org.id });
              setCreating(null);
            }}
          />
        )}
        {creating === "contact" && (
          <CreateContactPanel
            organisations={organisations ?? []}
            onCancel={() => setCreating(null)}
            onCreated={(contact) => {
              setContacts((prev) => [contact, ...prev]);
              setSelection({ type: "contact", id: contact.id });
              setCreating(null);
            }}
          />
        )}
        {!creating && selection?.type === "org" && (
          <OrgDetail
            key={selection.id}
            organisationId={selection.id}
            onSelectContact={(id) => setSelection({ type: "contact", id })}
            onUpdated={(org) => setOrganisations((prev) => (prev ?? []).map((o) => (o.id === org.id ? org : o)))}
          />
        )}
        {!creating && selection?.type === "contact" && (
          <ContactDetail
            key={selection.id}
            contactId={selection.id}
            onSelectOrg={(id) => setSelection({ type: "org", id })}
            onUpdated={(c) => setContacts((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
          />
        )}
        {!creating && !selection && (
          <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>
            Select a brand or person from the directory.
          </div>
        )}
      </div>
    </main>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.7rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        padding: "var(--space-4) var(--space-2) var(--space-2)",
      }}
    >
      {children}
    </div>
  );
}

function ListRow({
  active,
  onClick,
  avatarLetter,
  avatarColor,
  title,
  subtitle,
  tag,
}: {
  active: boolean;
  onClick: () => void;
  avatarLetter: string;
  avatarColor: string;
  title: React.ReactNode;
  subtitle: string;
  tag?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        width: "100%",
        padding: "var(--space-3) var(--space-2)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        background: active ? "var(--color-surface)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: avatarColor,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {avatarLetter || "?"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      </span>
      {tag && (
        <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "1px 6px", flexShrink: 0 }}>
          {tag}
        </span>
      )}
    </button>
  );
}

function StatsRow({ stats, lastActivity }: { stats: DealStats; lastActivity?: TimelineEntry }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        marginTop: "var(--space-6)",
      }}
    >
      <Stat
        value={formatMoney(stats.total_revenue, stats.currency)}
        label="Lifetime value"
        hint={stats.signed_count ? `across ${stats.signed_count} event${stats.signed_count === 1 ? "" : "s"}` : undefined}
      />
      <Stat
        value={String(stats.open_proposal_count)}
        label="Open proposals"
        hint={stats.open_proposal_count > 0 ? "awaiting decision" : undefined}
        divider
      />
      <Stat
        value={lastActivity ? relativeTime(lastActivity.timestamp) : "—"}
        label="Last activity"
        hint={lastActivity?.label}
        divider
      />
      <Stat
        value={stats.win_rate != null ? `${stats.win_rate.toFixed(0)}%` : "—"}
        label="Win rate"
        hint={stats.proposal_count ? `${stats.signed_count} of ${stats.proposal_count} proposals` : undefined}
        divider
      />
    </div>
  );
}

function Stat({ value, label, hint, divider }: { value: string; label: string; hint?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "var(--space-5) var(--space-6)", borderLeft: divider ? "1px solid var(--color-border)" : "none" }}>
      <div style={{ fontSize: "0.7rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", marginTop: "2px" }}>{value}</div>
      {hint && <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>}
    </div>
  );
}

const PILL_BUTTON_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-5)",
  borderRadius: "var(--radius-pill)",
  textDecoration: "none",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  cursor: "pointer",
  border: "none",
  font: "inherit",
};

function ActionButtons({ email, phone, onEdit }: { email?: string | null; phone?: string | null; onEdit: () => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
      <a
        href={email ? `mailto:${email}` : undefined}
        aria-disabled={!email}
        style={{
          ...PILL_BUTTON_BASE,
          background: email ? "var(--color-accent)" : "var(--color-surface)",
          color: email ? "#fff" : "var(--color-text-muted)",
          pointerEvents: email ? "auto" : "none",
        }}
      >
        ✉ Send email
      </a>
      <a
        href={phone ? `tel:${phone}` : undefined}
        aria-disabled={!phone}
        style={{
          ...PILL_BUTTON_BASE,
          border: "1px solid var(--color-border)",
          color: phone ? "var(--color-text-primary)" : "var(--color-text-muted)",
          pointerEvents: phone ? "auto" : "none",
        }}
      >
        ☎ Call
      </a>
      <button onClick={onEdit} style={{ ...PILL_BUTTON_BASE, border: "1px solid var(--color-border)", color: "var(--color-text-primary)", background: "transparent" }}>
        ✎ Edit
      </button>
    </div>
  );
}

function InfoCard({ rows }: { rows: [string, React.ReactNode][] }) {
  const present = rows.filter(([, v]) => v !== null && v !== "" && v !== undefined);
  if (present.length === 0) return null;
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
      {present.map(([label, value], i) => (
        <div key={label} style={{ display: "flex", padding: "var(--space-3) var(--space-4)", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
          <div style={{ width: "140px", flexShrink: 0, fontSize: "0.7rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            {label}
          </div>
          <div>{value}</div>
        </div>
      ))}
    </div>
  );
}

const TIMELINE_TAB_CATEGORY: Record<string, TimelineCategory | null> = {
  All: null,
  Proposals: "proposal",
  Emails: "email",
  Events: "event",
};

const TIMELINE_ICON: Record<TimelineEntry["type"], { symbol: string; color: string }> = {
  onboarded: { symbol: "○", color: "var(--color-navy)" },
  enquiry_received: { symbol: "✉", color: "var(--color-text-muted)" },
  brief_parsed: { symbol: "○", color: "var(--color-navy)" },
  proposal_sent: { symbol: "✓", color: "var(--color-accent)" },
  proposal_won: { symbol: "◆", color: "var(--color-success)" },
  proposal_declined: { symbol: "✕", color: "var(--color-text-muted)" },
  activity: { symbol: "•", color: "var(--color-text-muted)" },
};

/** Conversation timeline (client reference, 19 Jul) — every entry is real:
 * enquiries.raw_content for the actual received message, briefs' real
 * structured fields, proposals/proposal_venues for real venues and price
 * range, activity_log for everything else. What the reference shows that
 * isn't backed by any real data (tracking-pixel open counts, a feedback
 * quote, an attached PDF's page count) is simply left out rather than
 * invented — see the router docstring. */
function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const [tab, setTab] = useState<keyof typeof TIMELINE_TAB_CATEGORY>("All");
  const category = TIMELINE_TAB_CATEGORY[tab];
  const filtered = category ? entries.filter((e) => e.category === category || (category === "event" && e.category === "system")) : entries;

  return (
    <div style={{ marginTop: "var(--space-10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--space-5)" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.5rem" }}>
          Conversation <em style={{ color: "var(--color-accent)" }}>timeline</em>
        </h2>
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          {Object.keys(TIMELINE_TAB_CATEGORY).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as keyof typeof TIMELINE_TAB_CATEGORY)}
              style={{
                background: "none",
                border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--color-accent)" : "transparent"}`,
                padding: "0 0 var(--space-2)",
                cursor: "pointer",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: tab === t ? "var(--color-text-primary)" : "var(--color-text-muted)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Nothing here yet.</p>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "9px", top: "8px", bottom: "8px", width: "1px", background: "var(--color-border)" }} />
          {filtered.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TIMELINE_ICON[entry.type];
  const bodyTooLong = (entry.body?.length ?? 0) > 320;
  const shownBody = expanded || !bodyTooLong ? entry.body : `${entry.body!.slice(0, 320)}…`;

  return (
    <div style={{ position: "relative", paddingLeft: "var(--space-8)", paddingBottom: "var(--space-6)" }}>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: "2px",
          width: "19px",
          height: "19px",
          borderRadius: "50%",
          border: `1.5px solid ${icon.color}`,
          background: "var(--color-bg)",
          color: icon.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.65rem",
        }}
      >
        {icon.symbol}
      </span>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          {entry.label}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>{relativeTime(entry.timestamp)}</span>
      </div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", marginTop: "2px" }}>{entry.title}</div>

      {entry.fields && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--space-4)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            marginTop: "var(--space-3)",
          }}
        >
          {Object.entries(entry.fields).map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{label}</div>
              <div style={{ marginTop: "2px" }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {(entry.body || entry.venues) && (
        <div style={{ background: "var(--color-surface)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", marginTop: "var(--space-3)" }}>
          {entry.contact_name && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
              {entry.type === "proposal_sent" ? "TO " : "FROM "}
              <strong style={{ color: "var(--color-text-primary)" }}>{entry.contact_name}</strong>
              {entry.contact_email && ` · ${entry.contact_email}`}
            </div>
          )}
          {shownBody && (
            <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
              {shownBody}{" "}
              {bodyTooLong && (
                <button onClick={() => setExpanded((v) => !v)} style={{ ...editLinkStyle, fontSize: "0.75rem" }}>
                  {expanded ? "Show less" : "View full"}
                </button>
              )}
            </p>
          )}

          {entry.venues && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "var(--space-3)",
                background: "var(--color-navy)",
                color: "#fff",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-4)",
                marginTop: shownBody ? "var(--space-4)" : 0,
              }}
            >
              <div>
                <div style={{ fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-navy-text-muted)" }}>
                  Proposal
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", marginTop: "2px" }}>{entry.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-navy-text-muted)", marginTop: "2px" }}>
                  {entry.venues.join(" · ")}
                  {entry.price_low != null &&
                    ` · ${formatMoney(entry.price_low, entry.currency)}${entry.price_high && entry.price_high !== entry.price_low ? ` – ${formatMoney(entry.price_high, entry.currency)}` : ""}`}
                </div>
              </div>
              {entry.proposal_id && (
                <Link
                  href={`/app/proposals/${entry.proposal_id}`}
                  style={{ padding: "var(--space-2) var(--space-4)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "var(--radius-sm)", color: "#fff", textDecoration: "none", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0 }}
                >
                  Open
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ghostButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
  fontSize: "0.8rem",
};

const detailHeaderButtonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
  fontSize: "0.8rem",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: "0 0 var(--space-3)",
};

const editLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-accent)",
  cursor: "pointer",
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: 0,
};

function OrgDetail({
  organisationId,
  onSelectContact,
  onUpdated,
}: {
  organisationId: string;
  onSelectContact: (id: string) => void;
  onUpdated: (org: Organisation) => void;
}) {
  const [summary, setSummary] = useState<OrganisationSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OrganisationUpdate>({});
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { summary: data, timeline: timelineData } = await apiFetch<{
        summary: OrganisationSummary;
        timeline: TimelineEntry[];
      }>(`/organisations/${organisationId}/detail`);
      setSummary(data);
      setTimeline(timelineData);
      setNotesDraft(data.organisation.notes ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organisation");
    }
  }, [organisationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit() {
    try {
      const updated = await apiFetch<Organisation>(`/organisations/${organisationId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setSummary((prev) => (prev ? { ...prev, organisation: updated } : prev));
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const updated = await apiFetch<Organisation>(`/organisations/${organisationId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft }),
      });
      setSummary((prev) => (prev ? { ...prev, organisation: updated } : prev));
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  if (error) return <p style={{ padding: "var(--space-8)", color: "var(--color-danger)" }}>{error}</p>;
  if (!summary) return <p style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>Loading…</p>;

  const { organisation: org, contacts, stats, auto_imported } = summary;
  const primaryEmail = org.email ?? contacts.find((c) => c.email)?.email;
  const primaryPhone = org.phone ?? contacts.find((c) => c.phone)?.phone;
  const primaryContact = [...contacts].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const sinceYear = new Date(org.created_at ?? Date.now()).getFullYear();
  const lastActivity = timeline?.[0];

  return (
    <div style={{ padding: "var(--space-8)", maxWidth: "900px" }}>
      {!editing && (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
          {org.tier && (
            <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-accent)" }}>
              {ORGANISATION_TIER_LABEL[org.tier].toUpperCase()}
            </span>
          )}
          {org.tier && <span style={{ color: "var(--color-text-muted)" }}>·</span>}
          <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-text-muted)" }}>
            {ORGANISATION_KIND_LABEL[org.kind].toUpperCase()}
          </span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.2rem" }}>
            <StyledName name={org.name} />
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: "var(--space-1) 0 0", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {[org.region, `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on file`, `Client since ${sinceYear}`]
              .filter(Boolean)
              .join(" · ")}
            {auto_imported && <AutoImportedBadge />}
          </p>
        </div>
        {!editing && (
          <button onClick={() => { setEditing(true); setForm(org); }} style={editLinkStyle}>
            ✎ Edit
          </button>
        )}
        {editing && (
          <button onClick={() => setEditing(false)} style={detailHeaderButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      {!editing && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Link href="/app/enquiries" style={{ ...PILL_BUTTON_BASE, background: "var(--color-navy)", color: "#fff" }}>
            + New proposal
          </Link>
          <a
            href={primaryEmail ? `mailto:${primaryEmail}` : undefined}
            aria-disabled={!primaryEmail}
            style={{ ...PILL_BUTTON_BASE, background: primaryEmail ? "var(--color-accent)" : "var(--color-surface)", color: primaryEmail ? "#fff" : "var(--color-text-muted)", pointerEvents: primaryEmail ? "auto" : "none" }}
          >
            ✉ Send email
          </a>
          <a
            href={primaryPhone ? `tel:${primaryPhone}` : undefined}
            aria-disabled={!primaryPhone}
            style={{ ...PILL_BUTTON_BASE, border: "1px solid var(--color-border)", color: primaryPhone ? "var(--color-text-primary)" : "var(--color-text-muted)", pointerEvents: primaryPhone ? "auto" : "none" }}
          >
            ☎ Call
          </a>
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: "480px" }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.name ?? org.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div>
              <label style={labelStyle}>Kind</label>
              <select style={inputStyle} value={form.kind ?? org.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as OrganisationKind })}>
                {ORGANISATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ORGANISATION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tier</label>
              <select
                style={inputStyle}
                value={form.tier ?? org.tier ?? ""}
                onChange={(e) => setForm({ ...form, tier: (e.target.value || null) as OrganisationTier | null })}
              >
                <option value="">—</option>
                {ORGANISATION_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {ORGANISATION_TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Region</label>
            <input style={inputStyle} value={form.region ?? org.region ?? ""} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Parent company</label>
            <input
              style={inputStyle}
              value={form.parent_company ?? org.parent_company ?? ""}
              onChange={(e) => setForm({ ...form, parent_company: e.target.value })}
              placeholder="e.g. LVMH Group"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.email ?? org.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone ?? org.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address ?? org.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={form.website ?? org.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Rate card terms</label>
            <input
              style={inputStyle}
              value={form.rate_card_terms ?? org.rate_card_terms ?? ""}
              onChange={(e) => setForm({ ...form, rate_card_terms: e.target.value })}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={form.rate_card_on_file ?? org.rate_card_on_file}
              onChange={(e) => setForm({ ...form, rate_card_on_file: e.target.checked })}
            />
            Rate card on file
          </label>
          <button onClick={saveEdit} style={{ alignSelf: "flex-start", padding: "var(--space-2) var(--space-6)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}>
            Save
          </button>
        </div>
      ) : (
        <>
          <StatsRow stats={stats} lastActivity={lastActivity} />

          {primaryContact && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "var(--space-4)",
                marginTop: "var(--space-6)",
                padding: "var(--space-5)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <button onClick={() => onSelectContact(primaryContact.id)} style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                <span
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: avatarColorForId(primaryContact.id),
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initials(primaryContact.full_name)}
                </span>
                <span>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>
                    <StyledName name={primaryContact.full_name} />
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {[primaryContact.role, org.name].filter(Boolean).join(" · ")}
                  </div>
                </span>
              </button>
              <div style={{ display: "flex", gap: "var(--space-8)" }}>
                {primaryContact.email && (
                  <div>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Email</div>
                    <a href={`mailto:${primaryContact.email}`} style={{ color: "var(--color-text-primary)", textDecoration: "none" }}>
                      {primaryContact.email}
                    </a>
                  </div>
                )}
                {primaryContact.phone && (
                  <div>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Direct</div>
                    <a href={`tel:${primaryContact.phone}`} style={{ color: "var(--color-text-primary)", textDecoration: "none" }}>
                      {primaryContact.phone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <Timeline entries={timeline ?? []} />

          <div style={{ marginTop: "var(--space-8)" }}>
            <h2 style={sectionLabelStyle}>Details</h2>
            <InfoCard
              rows={[
                ["Company", org.parent_company],
                ["Email", org.email ?? primaryEmail],
                ["Phone", org.phone ?? primaryPhone],
                ["Address", org.address],
                ["Website", org.website ? <a href={org.website} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>{org.website}</a> : null],
                ["Tier", org.tier ? ORGANISATION_TIER_LABEL[org.tier] : null],
                ["Rate card", org.rate_card_on_file ? `On file${org.rate_card_terms ? ` — ${org.rate_card_terms}` : ""}` : null],
              ]}
            />
          </div>

          <div style={{ marginTop: "var(--space-8)" }}>
            <h2 style={sectionLabelStyle}>Work with</h2>
            {contacts.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No contacts on file yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelectContact(c.id)}
                    style={{
                      padding: "var(--space-3) var(--space-5)",
                      borderRadius: "var(--radius-lg)",
                      border: "none",
                      background: "var(--color-surface)",
                      cursor: "pointer",
                      textAlign: "left",
                      minWidth: "180px",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      <StyledName name={c.full_name} />
                    </div>
                    {c.role && <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>{c.role}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: "var(--space-8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={sectionLabelStyle}>Team notes</h2>
              {notesDraft !== (org.notes ?? "") && (
                <button onClick={saveNotes} disabled={savingNotes} style={editLinkStyle}>
                  {savingNotes ? "Saving…" : "Save"}
                </button>
              )}
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Shared notes on this client relationship…"
              style={{ ...inputStyle, minHeight: "100px", resize: "vertical", marginTop: "var(--space-2)" }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ContactDetail({
  contactId,
  onSelectOrg,
  onUpdated,
}: {
  contactId: string;
  onSelectOrg: (id: string) => void;
  onUpdated: (c: Contact) => void;
}) {
  const [summary, setSummary] = useState<ContactSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactUpdate>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const { summary: data, timeline: timelineData } = await apiFetch<{
        summary: ContactSummary;
        timeline: TimelineEntry[];
      }>(`/contacts/${contactId}/detail`);
      setSummary(data);
      setTimeline(timelineData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load contact");
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit() {
    try {
      const updated = await apiFetch<Contact>(`/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setSummary((prev) => (prev ? { ...prev, contact: updated } : prev));
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  if (error) return <p style={{ padding: "var(--space-8)", color: "var(--color-danger)" }}>{error}</p>;
  if (!summary) return <p style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>Loading…</p>;

  const { contact, organisation, stats } = summary;

  return (
    <div style={{ padding: "var(--space-8)", maxWidth: "820px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem" }}>
            <StyledName name={contact.full_name} />
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: "var(--space-1) 0 0" }}>
            {contact.role ?? "Contact"}
            {organisation && (
              <>
                {" · "}
                <button onClick={() => onSelectOrg(organisation.id)} style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0, font: "inherit" }}>
                  {organisation.name}
                </button>
              </>
            )}
          </p>
        </div>
        {editing && (
          <button onClick={() => setEditing(false)} style={detailHeaderButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      {!editing && <ActionButtons email={contact.email} phone={contact.phone} onEdit={() => { setEditing(true); setForm(contact); }} />}

      {editing ? (
        <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: "480px" }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.full_name ?? contact.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <input style={inputStyle} value={form.role ?? contact.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={form.email ?? contact.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.phone ?? contact.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <button onClick={saveEdit} style={{ alignSelf: "flex-start", padding: "var(--space-2) var(--space-6)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}>
            Save
          </button>
        </div>
      ) : (
        <>
          <StatsRow stats={stats} lastActivity={timeline?.[0]} />
          <Timeline entries={timeline ?? []} />
          <div style={{ marginTop: "var(--space-8)" }}>
            <h2 style={sectionLabelStyle}>Details</h2>
            <InfoCard
              rows={[
                ["Email", contact.email],
                ["Phone", contact.phone],
                ["Source", CONTACT_SOURCE_LABEL[contact.source]],
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CreateOrgPanel({ onCancel, onCreated }: { onCancel: () => void; onCreated: (org: Organisation) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OrganisationKind>("brand");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const payload: OrganisationCreate = { name: name.trim(), kind, region: region.trim() || null };
    try {
      onCreated(await apiFetch<Organisation>("/organisations", { method: "POST", body: JSON.stringify(payload) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create brand");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "var(--space-8)", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem" }}>New brand</h1>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Kind</label>
        <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as OrganisationKind)}>
          {ORGANISATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {ORGANISATION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Region</label>
        <input style={inputStyle} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Hong Kong" />
      </div>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" disabled={saving} style={{ padding: "var(--space-2) var(--space-6)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}>
          {saving ? "Creating…" : "Create brand"}
        </button>
        <button type="button" onClick={onCancel} style={detailHeaderButtonStyle}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateContactPanel({
  organisations,
  onCancel,
  onCreated,
}: {
  organisations: Organisation[];
  onCancel: () => void;
  onCreated: (contact: Contact) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    setError(null);
    const payload: ContactCreate = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role: role.trim() || null,
      organisation_id: organisationId || null,
      source: "manual" as ContactSource,
    };
    try {
      onCreated(await apiFetch<Contact>("/contacts", { method: "POST", body: JSON.stringify(payload) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create contact");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "var(--space-8)", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem" }}>New contact</h1>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Role</label>
        <input style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Communications Director" />
      </div>
      <div>
        <label style={labelStyle}>Organisation</label>
        <select style={inputStyle} value={organisationId} onChange={(e) => setOrganisationId(e.target.value)}>
          <option value="">— Independent —</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Phone</label>
        <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" disabled={saving} style={{ padding: "var(--space-2) var(--space-6)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}>
          {saving ? "Creating…" : "Create contact"}
        </button>
        <button type="button" onClick={onCancel} style={detailHeaderButtonStyle}>
          Cancel
        </button>
      </div>
    </form>
  );
}
