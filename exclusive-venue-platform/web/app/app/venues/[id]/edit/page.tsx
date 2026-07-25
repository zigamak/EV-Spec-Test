"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import PricingRulesTab from "./PricingRulesTab";
import {
  FILM_STATUS_LABEL,
  RESTRICTION_KINDS,
  SUGGESTED_ACCEPTED_EVENT_TYPES,
  SUGGESTED_IDEAL_FOR,
  SUGGESTED_VENUE_AMENITIES,
  VENUE_CATEGORIES,
  VENUE_CATEGORY_LABEL,
  type FilmStatus,
  type MediaKind,
  type RestrictionKind,
  type Venue,
  type VenueActivation,
  type VenueActivationCreate,
  type VenueCategory,
  type VenueConfiguration,
  type VenueConfigurationCreate,
  type VenueFilm,
  type VenueFilmCreate,
  type VenueMedia,
  type VenueRestriction,
  type VenueRestrictionCreate,
  type VenueTeamContact,
  type VenueTeamContactCreate,
  type VenueUpdate,
} from "@/lib/api/types";

const MEDIA_KINDS: MediaKind[] = ["photo", "video", "floor_plan"];

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
  fontSize: "0.85rem",
  color: "var(--color-text-secondary)",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "var(--space-1) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
};

/** Venue edit form (task B4): venue fields + configurations + restrictions.
 * Media upload/reorder is B5; availability calendar is B6/J2 — neither
 * lives here. */
export default function EditVenuePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const venueId = params.id;

  const [venue, setVenue] = useState<Venue | null>(null);
  const [configurations, setConfigurations] = useState<VenueConfiguration[]>([]);
  const [restrictions, setRestrictions] = useState<VenueRestriction[]>([]);
  const [media, setMedia] = useState<VenueMedia[]>([]);
  const [activations, setActivations] = useState<VenueActivation[]>([]);
  const [films, setFilms] = useState<VenueFilm[]>([]);
  const [teamContacts, setTeamContacts] = useState<VenueTeamContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [venueData, configData, restrictionData, mediaData, activationData, filmData, teamData] =
        await Promise.all([
          apiFetch<Venue>(`/venues/${venueId}`),
          apiFetch<VenueConfiguration[]>(`/venues/${venueId}/configurations`),
          apiFetch<VenueRestriction[]>(`/venues/${venueId}/restrictions`),
          apiFetch<VenueMedia[]>(`/venues/${venueId}/media`),
          apiFetch<VenueActivation[]>(`/venues/${venueId}/activations`),
          apiFetch<VenueFilm[]>(`/venues/${venueId}/films`),
          apiFetch<VenueTeamContact[]>(`/venues/${venueId}/team`),
        ]);
      setVenue(venueData);
      setConfigurations(configData);
      setRestrictions(restrictionData);
      setMedia(mediaData.sort((a, b) => a.sort_order - b.sort_order));
      setActivations(activationData);
      setFilms(filmData);
      setTeamContacts(teamData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load venue");
    }
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!venue) return;
    setError(null);
    setSaving(true);
    const payload: VenueUpdate = {
      name: venue.name.trim(),
      slug: venue.slug.trim(),
      description: venue.description?.trim() || null,
      address: venue.address?.trim() || null,
      district: venue.district?.trim() || null,
      category: venue.category,
      amenities: venue.amenities,
      ideal_for: venue.ideal_for,
      accepted_event_types: venue.accepted_event_types,
      surface_area_sqft: venue.surface_area_sqft,
      room_count: venue.room_count,
      access_note: venue.access_note?.trim() || null,
      view_note: venue.view_note?.trim() || null,
    };
    try {
      await apiFetch<Venue>(`/venues/${venueId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      router.push(`/app/venues/${venueId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save venue");
      setSaving(false);
    }
  }

  async function handleAddConfiguration(config: VenueConfigurationCreate) {
    try {
      const created = await apiFetch<VenueConfiguration>(`/venues/${venueId}/configurations`, {
        method: "POST",
        body: JSON.stringify(config),
      });
      setConfigurations((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add configuration");
    }
  }

  async function handleDeleteConfiguration(configId: string) {
    try {
      await apiFetch(`/venues/${venueId}/configurations/${configId}`, { method: "DELETE" });
      setConfigurations((prev) => prev.filter((c) => c.id !== configId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove configuration");
    }
  }

  async function handleUploadMedia(file: File, kind: MediaKind, caption: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    form.append("sort_order", String(media.length));
    if (caption.trim()) form.append("caption", caption.trim());
    try {
      const created = await apiFetch<VenueMedia>(`/venues/${venueId}/media`, {
        method: "POST",
        body: form,
      });
      setMedia((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload media");
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    try {
      await apiFetch(`/venues/${venueId}/media/${mediaId}`, { method: "DELETE" });
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove media");
    }
  }

  async function handleMoveMedia(mediaId: string, direction: -1 | 1) {
    const index = media.findIndex((m) => m.id === mediaId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= media.length) return;

    const current = media[index];
    const swapWith = media[swapIndex];
    if (!current || !swapWith) return;
    const reordered = [...media];
    reordered[index] = swapWith;
    reordered[swapIndex] = current;
    setMedia(reordered);

    try {
      await Promise.all([
        apiFetch(`/venues/${venueId}/media/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: swapIndex }),
        }),
        apiFetch(`/venues/${venueId}/media/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: index }),
        }),
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reorder media");
      load();
    }
  }

  async function handleAddRestriction(restriction: VenueRestrictionCreate) {
    try {
      const created = await apiFetch<VenueRestriction>(`/venues/${venueId}/restrictions`, {
        method: "POST",
        body: JSON.stringify(restriction),
      });
      setRestrictions((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add restriction");
    }
  }

  async function handleDeleteRestriction(restrictionId: string) {
    try {
      await apiFetch(`/venues/${venueId}/restrictions/${restrictionId}`, { method: "DELETE" });
      setRestrictions((prev) => prev.filter((r) => r.id !== restrictionId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove restriction");
    }
  }

  async function handleAddActivation(payload: VenueActivationCreate) {
    try {
      const created = await apiFetch<VenueActivation>(`/venues/${venueId}/activations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActivations((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add activation");
    }
  }

  async function handleDeleteActivation(id: string) {
    try {
      await apiFetch(`/venues/${venueId}/activations/${id}`, { method: "DELETE" });
      setActivations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove activation");
    }
  }

  async function handleAddFilm(payload: VenueFilmCreate) {
    try {
      const created = await apiFetch<VenueFilm>(`/venues/${venueId}/films`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFilms((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add film");
    }
  }

  async function handleDeleteFilm(id: string) {
    try {
      await apiFetch(`/venues/${venueId}/films/${id}`, { method: "DELETE" });
      setFilms((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove film");
    }
  }

  async function handleAddTeamContact(payload: VenueTeamContactCreate) {
    try {
      const created = await apiFetch<VenueTeamContact>(`/venues/${venueId}/team`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTeamContacts((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add team contact");
    }
  }

  async function handleDeleteTeamContact(id: string) {
    try {
      await apiFetch(`/venues/${venueId}/team/${id}`, { method: "DELETE" });
      setTeamContacts((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove team contact");
    }
  }

  if (!venue) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : <PageLoader label="Loading the venue" />}
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "640px", margin: "0 auto" }}>
      <Link href={`/app/venues/${venueId}`} style={{ color: "var(--color-text-secondary)" }}>
        ← {venue.name}
      </Link>

      <h1 style={{ marginTop: "var(--space-4)" }}>Edit venue</h1>

      <form
        onSubmit={handleSave}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-6)" }}
      >
        <div>
          <label style={labelStyle} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            style={inputStyle}
            value={venue.name}
            onChange={(e) => setVenue({ ...venue, name: e.target.value })}
            required
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            style={inputStyle}
            value={venue.slug}
            onChange={(e) => setVenue({ ...venue, slug: e.target.value })}
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
            required
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="district">
            District
          </label>
          <input
            id="district"
            style={inputStyle}
            value={venue.district ?? ""}
            onChange={(e) => setVenue({ ...venue, district: e.target.value })}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="address">
            Address
          </label>
          <input
            id="address"
            style={inputStyle}
            value={venue.address ?? ""}
            onChange={(e) => setVenue({ ...venue, address: e.target.value })}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
            value={venue.description ?? ""}
            onChange={(e) => setVenue({ ...venue, description: e.target.value })}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="category">
            Category
          </label>
          <select
            id="category"
            style={inputStyle}
            value={venue.category ?? ""}
            onChange={(e) => setVenue({ ...venue, category: (e.target.value || null) as VenueCategory | null })}
          >
            <option value="">Uncategorized</option>
            {VENUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENUE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Features</label>
          <ChipEditor
            suggested={SUGGESTED_VENUE_AMENITIES}
            selected={venue.amenities}
            onChange={(amenities) => setVenue({ ...venue, amenities })}
          />
        </div>

        <div>
          <label style={labelStyle}>Ideal for</label>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "0 0 var(--space-2)" }}>
            Where this venue truly shines — shown as the profile's highlight tags.
          </p>
          <ChipEditor
            suggested={SUGGESTED_IDEAL_FOR}
            selected={venue.ideal_for}
            onChange={(ideal_for) => setVenue({ ...venue, ideal_for })}
          />
        </div>

        <div>
          <label style={labelStyle}>Accepted event types</label>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "0 0 var(--space-2)" }}>
            The full list of formats this venue supports.
          </p>
          <ChipEditor
            suggested={SUGGESTED_ACCEPTED_EVENT_TYPES}
            selected={venue.accepted_event_types}
            onChange={(accepted_event_types) => setVenue({ ...venue, accepted_event_types })}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div>
            <label style={labelStyle} htmlFor="surface_area">
              Surface area (sq ft)
            </label>
            <input
              id="surface_area"
              type="number"
              min={0}
              style={inputStyle}
              value={venue.surface_area_sqft ?? ""}
              onChange={(e) =>
                setVenue({ ...venue, surface_area_sqft: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="room_count">
              Rooms
            </label>
            <input
              id="room_count"
              type="number"
              min={0}
              style={inputStyle}
              value={venue.room_count ?? ""}
              onChange={(e) => setVenue({ ...venue, room_count: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="access_note">
            Access
          </label>
          <input
            id="access_note"
            style={inputStyle}
            placeholder="e.g. By sampan only · car-free"
            value={venue.access_note ?? ""}
            onChange={(e) => setVenue({ ...venue, access_note: e.target.value })}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="view_note">
            View
          </label>
          <input
            id="view_note"
            style={inputStyle}
            placeholder="e.g. Ocean · garden · mountain"
            value={venue.view_note ?? ""}
            onChange={(e) => setVenue({ ...venue, view_note: e.target.value })}
          />
        </div>

        {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{
            alignSelf: "flex-start",
            padding: "var(--space-2) var(--space-5)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Media</h2>
        {media.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No photos, videos, or floor plans yet.</p>
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", margin: "var(--space-3) 0" }}>
            {media.map((m, i) => (
              <div key={m.id} style={{ width: "160px" }}>
                {m.kind === "photo" && m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.caption ?? ""}
                    style={{
                      width: "100%",
                      height: "110px",
                      objectFit: "cover",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                ) : m.kind === "video" && m.url ? (
                  <video
                    src={m.url}
                    controls
                    style={{
                      width: "100%",
                      height: "110px",
                      objectFit: "cover",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "110px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text-muted)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {m.kind}
                  </div>
                )}
                {m.caption && (
                  <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", margin: "var(--space-1) 0" }}>
                    {m.caption}
                  </p>
                )}
                <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
                  <button
                    style={smallButtonStyle}
                    disabled={i === 0}
                    onClick={() => handleMoveMedia(m.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    style={smallButtonStyle}
                    disabled={i === media.length - 1}
                    onClick={() => handleMoveMedia(m.id, 1)}
                  >
                    ↓
                  </button>
                  <button style={smallButtonStyle} onClick={() => handleDeleteMedia(m.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <MediaUploadForm onUpload={handleUploadMedia} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Configurations</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0" }}>
          {configurations.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span>
                {c.name} — capacity {c.capacity}
                {c.notes ? ` (${c.notes})` : ""}
              </span>
              <button style={smallButtonStyle} onClick={() => handleDeleteConfiguration(c.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <ConfigurationForm onAdd={handleAddConfiguration} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Restrictions</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0" }}>
          {restrictions.map((r) => (
            <li
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span>
                {r.kind.replace(/_/g, " ")}
                {r.value ? `: ${r.value}` : ""} — {r.hard ? "hard limit" : "soft preference"}
              </span>
              <button style={smallButtonStyle} onClick={() => handleDeleteRestriction(r.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <RestrictionForm onAdd={handleAddRestriction} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Past events</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0" }}>
          {activations.map((a) => (
            <li
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span>
                <strong>{a.client_name}</strong>
                {a.client_category ? ` (${a.client_category})` : ""}
                {a.event_type ? ` — ${a.event_type}` : ""}
                {a.event_date ? ` · ${a.event_date}` : ""}
              </span>
              <button style={smallButtonStyle} onClick={() => handleDeleteActivation(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <ActivationForm onAdd={handleAddActivation} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Films</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0" }}>
          {films.map((f) => (
            <li
              key={f.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span>
                <strong>{f.title}</strong>
                {f.duration_label ? ` (${f.duration_label})` : ""} — {FILM_STATUS_LABEL[f.status]}
              </span>
              <button style={smallButtonStyle} onClick={() => handleDeleteFilm(f.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <FilmForm onAdd={handleAddFilm} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Dedicated team</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0" }}>
          {teamContacts.map((t) => (
            <li
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span>
                <strong>{t.name}</strong> — {t.role}
                {t.phone ? ` · ${t.phone}` : ""}
                {t.email ? ` · ${t.email}` : ""}
              </span>
              <button style={smallButtonStyle} onClick={() => handleDeleteTeamContact(t.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <TeamContactForm onAdd={handleAddTeamContact} />
      </section>

      <section style={{ marginTop: "var(--space-10)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Pricing rules</h2>
        <PricingRulesTab venueId={venueId} />
      </section>
    </main>
  );
}

function MediaUploadForm({
  onUpload,
}: {
  onUpload: (file: File, kind: MediaKind, caption: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MediaKind>("photo");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    await onUpload(file, kind, caption);
    setFile(null);
    setCaption("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <select value={kind} onChange={(e) => setKind(e.target.value as MediaKind)} style={{ ...inputStyle, width: "auto" }}>
        {MEDIA_KINDS.map((k) => (
          <option key={k} value={k}>
            {k.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <input
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 160px" }}
      />
      <button type="submit" disabled={uploading || !file} style={smallButtonStyle}>
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

function ConfigurationForm({ onAdd }: { onAdd: (config: VenueConfigurationCreate) => Promise<void> }) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const capacityNum = Number(capacity);
    if (!name.trim() || !Number.isFinite(capacityNum) || capacityNum <= 0) return;
    setAdding(true);
    await onAdd({ name: name.trim(), capacity: capacityNum, notes: notes.trim() || null });
    setName("");
    setCapacity("");
    setNotes("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <input
        placeholder="Layout name (e.g. Banquet)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
      />
      <input
        placeholder="Capacity"
        type="number"
        min={1}
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 100px" }}
      />
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
      />
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        {adding ? "Adding…" : "Add layout"}
      </button>
    </form>
  );
}

function RestrictionForm({ onAdd }: { onAdd: (restriction: VenueRestrictionCreate) => Promise<void> }) {
  const [kind, setKind] = useState<RestrictionKind>("no_amplified_music");
  const [value, setValue] = useState("");
  const [hard, setHard] = useState(true);
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    await onAdd({ kind, value: value.trim() || null, hard });
    setValue("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as RestrictionKind)}
        style={{ ...inputStyle, width: "auto" }}
      >
        {RESTRICTION_KINDS.map((k) => (
          <option key={k} value={k}>
            {k.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <input
        placeholder="Value (optional)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 140px" }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "0.85rem" }}>
        <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
        Hard limit
      </label>
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        {adding ? "Adding…" : "Add restriction"}
      </button>
    </form>
  );
}

function ChipEditor({
  suggested,
  selected,
  onChange,
}: {
  suggested: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag]);
  }

  function addCustom() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!selected.includes(trimmed)) onChange([...selected, trimmed]);
    setValue("");
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {Array.from(new Set([...suggested, ...selected])).map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              type="button"
              key={tag}
              onClick={() => toggle(tag)}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-pill)",
                border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                background: active ? "var(--color-accent)" : "transparent",
                color: active ? "#fff" : "var(--color-text-secondary)",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        <input
          placeholder="Custom tag…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          style={{ ...inputStyle, width: "auto", flex: "1 1 200px" }}
        />
        <button type="button" onClick={addCustom} style={smallButtonStyle}>
          + Add
        </button>
      </div>
    </div>
  );
}

function ActivationForm({ onAdd }: { onAdd: (payload: VenueActivationCreate) => Promise<void> }) {
  const [clientName, setClientName] = useState("");
  const [clientCategory, setClientCategory] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setAdding(true);
    await onAdd({
      client_name: clientName.trim(),
      client_category: clientCategory.trim() || null,
      event_type: eventType.trim() || null,
      event_date: eventDate || null,
    });
    setClientName("");
    setClientCategory("");
    setEventType("");
    setEventDate("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <input
        placeholder="Client name"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
      />
      <input
        placeholder="Category (e.g. Maison)"
        value={clientCategory}
        onChange={(e) => setClientCategory(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 120px" }}
      />
      <input
        placeholder="Event type (e.g. Garden dinner)"
        value={eventType}
        onChange={(e) => setEventType(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
      />
      <input
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
        style={{ ...inputStyle, width: "auto" }}
      />
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        {adding ? "Adding…" : "Add past event"}
      </button>
    </form>
  );
}

function FilmForm({ onAdd }: { onAdd: (payload: VenueFilmCreate) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<FilmStatus>("planned");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    await onAdd({ title: title.trim(), duration_label: duration.trim() || null, status });
    setTitle("");
    setDuration("");
    setStatus("planned");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <input
        placeholder="Film title (e.g. Arrival by sampan)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "2 1 200px" }}
      />
      <input
        placeholder="Duration (e.g. 0:24)"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 100px" }}
      />
      <select value={status} onChange={(e) => setStatus(e.target.value as FilmStatus)} style={{ ...inputStyle, width: "auto" }}>
        {Object.entries(FILM_STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        {adding ? "Adding…" : "Add film"}
      </button>
    </form>
  );
}

function TeamContactForm({ onAdd }: { onAdd: (payload: VenueTeamContactCreate) => Promise<void> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;
    setAdding(true);
    await onAdd({
      name: name.trim(),
      role: role.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    setName("");
    setRole("");
    setPhone("");
    setEmail("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 140px" }}
      />
      <input
        placeholder="Role (e.g. Account Director)"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 160px" }}
      />
      <input
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 140px" }}
      />
      <input
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ ...inputStyle, width: "auto", flex: "1 1 180px" }}
      />
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        {adding ? "Adding…" : "Add contact"}
      </button>
    </form>
  );
}
