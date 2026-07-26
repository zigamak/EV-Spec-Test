"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  VENUE_CATEGORY_LABEL,
  type AvailabilityReason,
  type PricingRule,
  type VenueAvailability,
  type VenueAvailabilityCreate,
  type VenueWithProfile,
} from "@/lib/api/types";
import { toIsoDate } from "@/lib/utils";

const REASON_COLOR: Record<AvailabilityReason, string> = {
  booked: "var(--color-danger)",
  hold: "var(--color-warning)",
  maintenance: "var(--color-text-muted)",
  landlord_blocked: "var(--color-text-muted)",
  other: "var(--color-text-muted)",
};

const REASONS: AvailabilityReason[] = ["hold", "booked", "maintenance", "landlord_blocked", "other"];

const HERO_GRADIENTS = [
  "linear-gradient(135deg, #5c7789, #26333c)",
  "linear-gradient(135deg, #cbb489, #8a7550)",
  "linear-gradient(135deg, #4a3628, #1a1210)",
  "linear-gradient(135deg, #6b5b73, #2b232f)",
];

function gradientFor(id: string): string {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return HERO_GRADIENTS[sum % HERO_GRADIENTS.length]!;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const EVENT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

const PILL_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontStyle: "italic",
  color: "var(--color-accent)",
  fontSize: "0.85rem",
  margin: 0,
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "var(--space-1) 0 0",
};

const SECTION_HINT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontStyle: "italic",
  color: "var(--color-text-muted)",
  fontSize: "0.85rem",
  margin: "var(--space-2) 0 0",
};

/** Venue Profile — "Operator View" (task B3 redesign, client reference
 * 18 Jul). Every stat/section renders from real data (venue_configurations,
 * venue_activations, venue_films, venue_team_contacts, ideal_for/
 * accepted_event_types) and disappears rather than showing a fabricated
 * placeholder when that data doesn't exist yet for a venue — see the "no
 * invented brand names/staff" discussion that scoped this. Standing/
 * Sitting stats are derived by matching venue_configurations names
 * (case-insensitive) rather than new columns, since that table already
 * models exactly this. */
export default function VenueProfilePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [profile, setProfile] = useState<VenueWithProfile | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [availability, setAvailability] = useState<VenueAvailability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      // /profile now embeds pricing_rules + venue_availability too (24 Jul
      // perf pass) — was 3 separate fetches, each paying its own Supabase
      // client TLS handshake (app/core/scoped_client.py).
      const profileData = await apiFetch<
        VenueWithProfile & { pricing_rules: PricingRule[]; venue_availability: VenueAvailability[] }
      >(`/venues/${venueId}/profile`);
      setProfile(profileData);
      setPricingRules(profileData.pricing_rules);
      setAvailability(profileData.venue_availability);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load venue");
    }
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove() {
    if (!profile) return;
    setApproving(true);
    try {
      const updated = await apiFetch<VenueWithProfile>(`/venues/${venueId}/approve`, { method: "POST" });
      setProfile({ ...profile, ...updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  async function handleAddAvailability(payload: VenueAvailabilityCreate) {
    try {
      const created = await apiFetch<VenueAvailability>(`/venues/${venueId}/availability`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAvailability((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add availability block");
    }
  }

  async function handleDeleteAvailability(id: string) {
    try {
      await apiFetch(`/venues/${venueId}/availability/${id}`, { method: "DELETE" });
      setAvailability((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove availability block");
    }
  }

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  const photos = profile.venue_media.filter((m) => m.kind === "photo" && m.url);
  const heroPhoto = photos.find((p) => p.id === profile.hero_media_id) ?? photos[0];
  const standingConfig = profile.venue_configurations.find((c) => /stand/i.test(c.name));
  const sittingConfig = profile.venue_configurations.find((c) => /sit|seat/i.test(c.name));
  const descriptionSentences = profile.description ? profile.description.split(/(?<=\.)\s+/) : [];
  const summarySentence = descriptionSentences[0] ?? null;

  const primaryContactEmail = profile.venue_team_contacts[0]?.email;

  return (
    <main style={{ background: "var(--color-surface)", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-8)",
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", color: "var(--color-accent)" }}>
            ◆ OPERATOR VIEW
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Last updated {DATE_FORMAT.format(new Date(profile.updated_at))} · {photos.length} photo{photos.length === 1 ? "" : "s"} on file
            · {pricingRules.length} rate card{pricingRules.length === 1 ? "" : "s"} · {profile.venue_activations.length} past event
            {profile.venue_activations.length === 1 ? "" : "s"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Link href={`/app/venues/${venueId}/edit`} style={topBarButtonStyle}>
            Edit listing
          </Link>
          <a href="#pricing" style={topBarButtonStyle}>
            Pricing rules
          </a>
          <a href="#availability" style={topBarButtonStyle}>
            Calendar
          </a>
        </div>
      </div>

      {/* Hero */}
      <div style={{ position: "relative", width: "100%", height: "440px", background: gradientFor(profile.id), overflow: "hidden" }}>
        {heroPhoto?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.url} alt={profile.name} style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "var(--space-8)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "var(--space-6)",
          }}
        >
          <div style={{ maxWidth: "640px" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400, fontSize: "3.5rem", color: "#fff" }}>
              {profile.name}
            </h1>
            {profile.description && (
              <p style={{ color: "rgba(255,255,255,0.9)", fontSize: "1.1rem", margin: "var(--space-2) 0 var(--space-4)" }}>
                {profile.description}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", fontSize: "0.85rem" }}>
              {(profile.district || profile.category) && (
                <span style={{ color: "#fff" }}>
                  ◆ {[profile.district, profile.category ? VENUE_CATEGORY_LABEL[profile.category].toLowerCase() : null].filter(Boolean).join(" · ")}
                </span>
              )}
              {profile.access_note && <span style={{ color: "#fff" }}>◆ {profile.access_note}</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-6)" }}>
            {standingConfig && <HeroStat value={String(standingConfig.capacity)} label="Standing" />}
            {sittingConfig && <HeroStat value={String(sittingConfig.capacity)} label="Sitting" />}
            {profile.room_count != null && <HeroStat value={String(profile.room_count)} label="Rooms" />}
            {profile.surface_area_sqft != null && <HeroStat value={profile.surface_area_sqft.toLocaleString()} unit="ft²" label="Surface" />}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* 01 Presentation */}
        <SectionRow index="01" label="The venue presentation" hint={summarySentence}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-8)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontSize: "1.05rem", lineHeight: 1.6 }}>
              {descriptionSentences.length > 0 ? (
                <p style={{ margin: 0 }}>{profile.description}</p>
              ) : (
                <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No description on file yet.</p>
              )}
            </div>
            <InfoCard profile={profile} />
          </div>
        </SectionRow>

        {/* 02 Ideal for */}
        {profile.ideal_for.length > 0 && (
          <SectionRow index="02" label="Ideal for" hint="Where this venue truly shines.">
            <PillRow items={profile.ideal_for} />
          </SectionRow>
        )}

        {/* 03 Accepted events */}
        {profile.accepted_event_types.length > 0 && (
          <SectionRow index="03" label="Accepted events" hint="Full list of formats this venue supports.">
            <PillRow items={profile.accepted_event_types} />
          </SectionRow>
        )}

        {/* 04 Capacity */}
        <SectionRow index="04" label="Capacity" hint="Hard limits, by format.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
            {standingConfig && <CapacityCard value={String(standingConfig.capacity)} label="Standing" />}
            {sittingConfig && <CapacityCard value={String(sittingConfig.capacity)} label="Sitting" />}
            {profile.room_count != null && <CapacityCard value={String(profile.room_count)} label="Rooms" />}
            {profile.surface_area_sqft != null && (
              <CapacityCard value={profile.surface_area_sqft.toLocaleString()} unit="ft²" label="Surface area" />
            )}
            {!standingConfig && !sittingConfig && profile.room_count == null && profile.surface_area_sqft == null && (
              <p style={{ color: "var(--color-text-muted)", gridColumn: "1 / -1" }}>
                No capacity stats on file yet — add layouts, room count, or surface area from the edit page.
              </p>
            )}
          </div>
          {profile.venue_configurations.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-5) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {profile.venue_configurations.map((c) => (
                <li key={c.id} style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                  {c.name} — capacity {c.capacity}
                  {c.notes ? ` (${c.notes})` : ""}
                </li>
              ))}
            </ul>
          )}
        </SectionRow>

        {/* 05 Pictures */}
        {photos.length > 0 && (
          <SectionRow index="05" label="The venue in pictures" hint="Light, water, and architecture.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url!}
                  alt={p.caption ?? profile.name}
                  style={{ width: "100%", height: "220px", objectFit: "cover", borderRadius: "var(--radius-md)" }}
                />
              ))}
            </div>
          </SectionRow>
        )}

        {/* 06 Films */}
        {profile.venue_films.length > 0 && (
          <SectionRow index="06" label="Films" hint="Reels & walkthroughs · shot on-property.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
              {profile.venue_films.map((f, i) => (
                <FilmCard key={f.id} film={f} backdrop={photos[i % Math.max(photos.length, 1)]?.url ?? null} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-4)", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              <span>
                {profile.venue_films.length} film{profile.venue_films.length === 1 ? "" : "s"}
                {profile.venue_films.some((f) => f.status !== "delivered")
                  ? ` · ${profile.venue_films.filter((f) => f.status !== "delivered").length} in production`
                  : ""}
              </span>
              {primaryContactEmail && (
                <a
                  href={`mailto:${primaryContactEmail}?subject=${encodeURIComponent(`Preview cuts — ${profile.name}`)}`}
                  style={{ color: "var(--color-accent)", fontStyle: "normal", fontWeight: 600, textDecoration: "none" }}
                >
                  Request preview cuts →
                </a>
              )}
            </div>
          </SectionRow>
        )}

        {/* 07 Past events */}
        {profile.venue_activations.length > 0 && (
          <SectionRow index="07" label="Past events" hint="All under NDA · references on request.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
              {profile.venue_activations.map((a) => (
                <div key={a.id} style={{ borderRadius: "var(--radius-md)", padding: "var(--space-5)", minHeight: "140px", display: "flex", flexDirection: "column", justifyContent: "flex-end", background: gradientFor(a.id), color: "#fff" }}>
                  {a.client_category && (
                    <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>
                      {a.client_category}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.3rem", marginTop: "var(--space-1)" }}>
                    {a.client_name}
                  </span>
                  <span style={{ fontSize: "0.8rem", opacity: 0.9, marginTop: "var(--space-1)" }}>
                    {[a.event_type, a.event_date ? EVENT_DATE_FORMAT.format(new Date(a.event_date)) : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-4)", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              <span>
                {profile.venue_activations.length} event{profile.venue_activations.length === 1 ? "" : "s"} hosted at {profile.name} · client list protected by NDA
              </span>
              {primaryContactEmail && (
                <a
                  href={`mailto:${primaryContactEmail}?subject=${encodeURIComponent(`Past activations — ${profile.name}`)}`}
                  style={{ color: "var(--color-accent)", fontStyle: "normal", fontWeight: 600, textDecoration: "none" }}
                >
                  Discuss past activations →
                </a>
              )}
            </div>
          </SectionRow>
        )}

        {/* 08 Dedicated team */}
        {profile.venue_team_contacts.length > 0 && (
          <SectionRow index="08" label="Your dedicated team" hint="Point of contact for this venue.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
              {profile.venue_team_contacts.map((t) => (
                <div key={t.id} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>{t.name}</div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", margin: "var(--space-1) 0 var(--space-3)" }}>{t.role}</div>
                  {t.phone && <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>M {t.phone}</div>}
                  {t.email && <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>{t.email}</div>}
                </div>
              ))}
            </div>
          </SectionRow>
        )}

        {/* Restrictions (kept from the operational build — not in the reference, still needed) */}
        <SectionRow index="09" label="Restrictions" hint="Hard limits and soft preferences the recommendation engine reasons over.">
          <RestrictionsPanel venueId={venueId} />
        </SectionRow>

        {/* Availability */}
        <div id="availability" />
        <SectionRow index="10" label="Availability" hint="Booked and held windows.">
          <AvailabilityCalendar month={month} onMonthChange={setMonth} availability={availability} onDelete={handleDeleteAvailability} />
          <AvailabilityForm onAdd={handleAddAvailability} />
        </SectionRow>

        <div id="pricing" style={{ padding: "0 var(--space-8) var(--space-10)" }}>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {pricingRules.length} rate card{pricingRules.length === 1 ? "" : "s"} on file — manage pricing from{" "}
            <Link href={`/app/venues/${venueId}/edit`} style={{ color: "var(--color-accent)" }}>
              the edit page
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Approval + next-step CTA */}
      <div
        style={{
          background: "var(--color-navy)",
          color: "#fff",
          padding: "var(--space-8)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <div style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-navy-text-muted)" }}>
            Next step
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", marginTop: "var(--space-1)" }}>
            Hold a date, <em style={{ color: "#e8b4bd" }}>or check availability</em>.
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {profile.status === "pending_approval" && (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{ padding: "var(--space-3) var(--space-6)", background: "var(--color-success)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: approving ? "default" : "pointer", fontWeight: 600 }}
            >
              {approving ? "Approving…" : "Approve venue"}
            </button>
          )}
          <a href="#availability" style={{ padding: "var(--space-3) var(--space-6)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "var(--radius-sm)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
            View calendar
          </a>
          <Link href={`/app/venues/${venueId}/edit`} style={{ padding: "var(--space-3) var(--space-6)", background: "var(--color-accent)", color: "#fff", borderRadius: "var(--radius-sm)", textDecoration: "none", fontWeight: 600 }}>
            Edit listing
          </Link>
        </div>
      </div>
    </main>
  );
}

const topBarButtonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text-primary)",
  textDecoration: "none",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

function HeroStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: "2rem" }}>
        {value}
        {unit && <span style={{ fontSize: "1rem" }}>{unit}</span>}
      </div>
      <div style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>{label}</div>
    </div>
  );
}

function CapacityCard({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
      <div style={{ color: "var(--color-accent)", fontSize: "1.2rem" }}>●</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", marginTop: "var(--space-2)" }}>
        {value}
        {unit && <span style={{ fontSize: "1rem" }}> {unit}</span>}
      </div>
      <div style={{ fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{label}</div>
    </div>
  );
}

function PillRow({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
      {items.map((item) => (
        <span key={item} style={PILL_STYLE}>
          <span style={{ color: "var(--color-accent)" }}>•</span>
          {item}
        </span>
      ))}
    </div>
  );
}

function InfoCard({ profile }: { profile: VenueWithProfile }) {
  const rows: [string, string | null][] = [
    ["Location", [profile.district, profile.address].filter(Boolean).join(" · ") || null],
    ["Access", profile.access_note],
    ["Surface", profile.surface_area_sqft != null ? `${profile.surface_area_sqft.toLocaleString()} sq ft` : null],
    ["Rooms", profile.room_count != null ? String(profile.room_count) : null],
    ["View", profile.view_note],
    ["Category", profile.category ? VENUE_CATEGORY_LABEL[profile.category] : null],
  ].filter(([, value]) => value !== null) as [string, string][];

  if (rows.length === 0) return null;

  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
      {rows.map(([label, value], i) => (
        <div key={label} style={{ padding: "var(--space-3) 0", borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{label}</div>
          <div style={{ marginTop: "2px" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function SectionRow({
  index,
  label,
  hint,
  children,
}: {
  index: string;
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: "var(--space-8)",
        padding: "var(--space-10) var(--space-8)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div>
        <p style={SECTION_LABEL_STYLE}>{index}</p>
        <p style={SECTION_TITLE_STYLE}>{label}</p>
        {hint && <p style={SECTION_HINT_STYLE}>{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function FilmCard({ film, backdrop }: { film: { title: string; duration_label: string | null; status: string; video_url: string | null }; backdrop: string | null }) {
  const delivered = film.status === "delivered" && film.video_url;
  return (
    <a
      href={delivered ? film.video_url! : undefined}
      target={delivered ? "_blank" : undefined}
      rel={delivered ? "noreferrer" : undefined}
      style={{ display: "block", textDecoration: "none", color: "inherit", cursor: delivered ? "pointer" : "default" }}
    >
      <div style={{ position: "relative", width: "100%", height: "260px", borderRadius: "var(--radius-md)", overflow: "hidden", background: "#20242b" }}>
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))" }} />
        {film.duration_label && (
          <span style={{ position: "absolute", top: "var(--space-3)", right: "var(--space-3)", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "0.7rem", padding: "2px var(--space-2)", borderRadius: "var(--radius-sm)" }}>
            {film.duration_label}
          </span>
        )}
        <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "44px", height: "44px", borderRadius: "50%", background: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ▶
        </span>
        <div style={{ position: "absolute", left: "var(--space-3)", bottom: "var(--space-3)", color: "#fff" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{film.title}</div>
          {film.status !== "delivered" && (
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.06em", color: "#e8b4bd", marginTop: "2px" }}>
              {film.status === "in_production" ? "IN PRODUCTION" : "FILM COMING SOON"}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function AvailabilityCalendar({
  month,
  onMonthChange,
  availability,
  onDelete,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  availability: VenueAvailability[];
  onDelete: (id: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function windowsOn(day: Date): VenueAvailability[] {
    const iso = toIsoDate(day);
    return availability.filter((a) => iso >= a.starts_on && iso <= a.ends_on);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <button
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          ←
        </button>
        <strong>{MONTH_FORMAT.format(month)}</strong>
        <button
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--space-1)" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center" }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const windows = windowsOn(day);
          return (
            <div
              key={i}
              style={{
                minHeight: "56px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-1)",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ color: "var(--color-text-muted)" }}>{day.getDate()}</div>
              {windows.map((w) => (
                <div
                  key={w.id}
                  title={
                    w.reason === "hold" && w.hold_expires_at
                      ? `Hold expires ${new Date(w.hold_expires_at).toLocaleString()}${w.note ? ` — ${w.note}` : ""}`
                      : w.note ?? undefined
                  }
                  onClick={() => {
                    if (confirm(`Remove this ${w.reason.replace("_", " ")} block?`)) onDelete(w.id);
                  }}
                  style={{
                    marginTop: "2px",
                    padding: "1px 4px",
                    borderRadius: "3px",
                    background: REASON_COLOR[w.reason],
                    color: "#fff",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w.reason.replace("_", " ")}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvailabilityForm({ onAdd }: { onAdd: (payload: VenueAvailabilityCreate) => Promise<void> }) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState<AvailabilityReason>("hold");
  const [holdExpiresAt, setHoldExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startsOn || !endsOn) return;
    if (reason === "hold" && !holdExpiresAt) return;
    setAdding(true);
    await onAdd({
      starts_on: startsOn,
      ends_on: endsOn,
      reason,
      hold_expires_at: reason === "hold" ? new Date(holdExpiresAt).toISOString() : null,
      note: note.trim() || null,
    });
    setStartsOn("");
    setEndsOn("");
    setHoldExpiresAt("");
    setNote("");
    setAdding(false);
  }

  const fieldStyle: React.CSSProperties = {
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--space-3)" }}
    >
      <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={fieldStyle} required />
      <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} style={fieldStyle} required />
      <select value={reason} onChange={(e) => setReason(e.target.value as AvailabilityReason)} style={fieldStyle}>
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
      {reason === "hold" && (
        <input
          type="datetime-local"
          value={holdExpiresAt}
          onChange={(e) => setHoldExpiresAt(e.target.value)}
          style={fieldStyle}
          required
        />
      )}
      <input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ ...fieldStyle, flex: "1 1 140px" }}
      />
      <button
        type="submit"
        disabled={adding}
        style={{ padding: "var(--space-1) var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
      >
        {adding ? "Adding…" : "Add block"}
      </button>
    </form>
  );
}

function RestrictionsPanel({ venueId }: { venueId: string }) {
  const [restrictions, setRestrictions] = useState<
    { id: string; kind: string; value: string | null; hard: boolean }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ id: string; kind: string; value: string | null; hard: boolean }[]>(`/venues/${venueId}/restrictions`)
      .then((data) => {
        if (!cancelled) setRestrictions(data);
      })
      .catch(() => {
        if (!cancelled) setRestrictions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  if (restrictions === null) return <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>;
  if (restrictions.length === 0) return <p style={{ color: "var(--color-text-muted)" }}>No restrictions on file.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {restrictions.map((r) => (
        <li key={r.id} style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}>
          {r.kind.replace(/_/g, " ")}
          {r.value ? `: ${r.value}` : ""} — {r.hard ? "hard limit" : "soft preference"}
        </li>
      ))}
    </ul>
  );
}
