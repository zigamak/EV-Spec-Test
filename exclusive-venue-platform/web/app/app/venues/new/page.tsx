"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import {
  SUGGESTED_VENUE_AMENITIES,
  VENUE_CATEGORIES,
  VENUE_CATEGORY_LABEL,
  type MediaKind,
  type Venue,
  type VenueCategory,
  type VenueCreate,
} from "@/lib/api/types";
import { slugify } from "@/lib/utils";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  background: "var(--color-bg)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "var(--space-2)",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-6)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "1.3rem",
  fontWeight: 400,
  margin: 0,
};

const sectionSubtitleStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "0.85rem",
  margin: "var(--space-1) 0 var(--space-5)",
};

interface StagedLayout {
  key: string;
  name: string;
  capacity: string;
  notes: string;
}

interface StagedMedia {
  key: string;
  file: File;
  kind: MediaKind;
  caption: string;
  previewUrl: string;
  lowRes: boolean;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

/** Venue create form (task B4), redesigned toward a single rich "Add
 * venue" flow: basics, size & layouts, amenities, and media all captured
 * up front instead of a bare-bones form + a separate edit-page follow-up.
 * Layouts/media are staged client-side (a venue needs an id before either
 * can be persisted) and committed in sequence once the venue is created. */
export default function NewVenuePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState<VenueCategory | "">("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [customAmenity, setCustomAmenity] = useState("");

  const [layouts, setLayouts] = useState<StagedLayout[]>([]);
  const [layoutName, setLayoutName] = useState("");
  const [layoutCapacity, setLayoutCapacity] = useState("");
  const [layoutNotes, setLayoutNotes] = useState("");

  const [media, setMedia] = useState<StagedMedia[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function toggleAmenity(f: string) {
    setAmenities((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function addCustomAmenity() {
    const value = customAmenity.trim();
    if (!value || amenities.includes(value)) {
      setCustomAmenity("");
      return;
    }
    setAmenities((prev) => [...prev, value]);
    setCustomAmenity("");
  }

  function addLayout() {
    const capacityNum = Number(layoutCapacity);
    if (!layoutName.trim() || !Number.isFinite(capacityNum) || capacityNum <= 0) return;
    setLayouts((prev) => [
      ...prev,
      { key: nextKey(), name: layoutName.trim(), capacity: layoutCapacity, notes: layoutNotes.trim() },
    ]);
    setLayoutName("");
    setLayoutCapacity("");
    setLayoutNotes("");
  }

  function removeLayout(key: string) {
    setLayouts((prev) => prev.filter((l) => l.key !== key));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      const kind: MediaKind = isVideo ? "video" : "photo";
      const previewUrl = URL.createObjectURL(file);
      const key = nextKey();

      setMedia((prev) => [...prev, { key, file, kind, caption: "", previewUrl, lowRes: false }]);

      if (!isVideo) {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth < 1200) {
            setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, lowRes: true } : m)));
          }
        };
        img.src = previewUrl;
      }
    });
  }

  function removeMedia(key: string) {
    setMedia((prev) => {
      const target = prev.find((m) => m.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((m) => m.key !== key);
    });
  }

  function updateMediaField(key: string, patch: Partial<Pick<StagedMedia, "caption" | "kind">>) {
    setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: VenueCreate = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      address: address.trim() || null,
      district: district.trim() || null,
      category: category || null,
      amenities,
    };

    try {
      setProgress("Creating venue…");
      const venue = await apiFetch<Venue>("/venues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      for (let i = 0; i < layouts.length; i++) {
        const l = layouts[i];
        if (!l) continue;
        setProgress(`Adding layout ${i + 1} of ${layouts.length}…`);
        await apiFetch(`/venues/${venue.id}/configurations`, {
          method: "POST",
          body: JSON.stringify({
            name: l.name,
            capacity: Number(l.capacity),
            notes: l.notes || null,
          }),
        });
      }

      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        if (!m) continue;
        setProgress(`Uploading ${m.kind} ${i + 1} of ${media.length}…`);
        const form = new FormData();
        form.append("file", m.file);
        form.append("kind", m.kind);
        form.append("sort_order", String(i));
        if (m.caption.trim()) form.append("caption", m.caption.trim());
        await apiFetch(`/venues/${venue.id}/media`, { method: "POST", body: form });
      }

      setProgress(null);
      router.push(`/app/venues/${venue.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create venue");
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "820px", margin: "0 auto" }}>
      <Link href="/app/venues" style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
        ← The portfolio
      </Link>

      <h1 style={{ marginTop: "var(--space-4)", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.1rem" }}>
        Add a <em style={{ color: "var(--color-accent)" }}>venue</em>
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-2)", marginBottom: "var(--space-8)" }}>
        Photos, layouts, and amenities can all be added now, or later from the venue's edit page.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Basics</h2>
          <p style={sectionSubtitleStyle}>Name, location, and how it appears in the portfolio.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <div>
              <label style={labelStyle} htmlFor="name">
                Name
              </label>
              <input
                id="name"
                style={inputStyle}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. The Peak Skyline Hall"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div>
                <label style={labelStyle} htmlFor="slug">
                  Slug
                </label>
                <input
                  id="slug"
                  style={inputStyle}
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                  required
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="category">
                  Category
                </label>
                <select
                  id="category"
                  style={inputStyle}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as VenueCategory | "")}
                >
                  <option value="">Uncategorized</option>
                  {VENUE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {VENUE_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div>
                <label style={labelStyle} htmlFor="district">
                  District
                </label>
                <input
                  id="district"
                  style={inputStyle}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Central"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="address">
                  Address
                </label>
                <input id="address" style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes this space distinctive — views, style, ideal use cases…"
              />
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Size & layouts</h2>
          <p style={sectionSubtitleStyle}>Add each seating/standing configuration and its capacity.</p>

          {layouts.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)" }}>
              {layouts.map((l) => (
                <li
                  key={l.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-3) 0",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <span>
                    <strong>{l.name}</strong> — capacity {l.capacity}
                    {l.notes ? ` (${l.notes})` : ""}
                  </span>
                  <button type="button" onClick={() => removeLayout(l.key)} style={ghostButtonStyle}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <input
              placeholder="Layout name (e.g. Banquet)"
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
            />
            <input
              placeholder="Capacity"
              type="number"
              min={1}
              value={layoutCapacity}
              onChange={(e) => setLayoutCapacity(e.target.value)}
              style={{ ...inputStyle, width: "auto", flex: "1 1 100px" }}
            />
            <input
              placeholder="Notes (optional)"
              value={layoutNotes}
              onChange={(e) => setLayoutNotes(e.target.value)}
              style={{ ...inputStyle, width: "auto", flex: "2 1 160px" }}
            />
            <button type="button" onClick={addLayout} style={ghostButtonStyle}>
              + Add layout
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Features</h2>
          <p style={sectionSubtitleStyle}>Select what applies, or add your own.</p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {SUGGESTED_VENUE_AMENITIES.map((f) => {
              const active = amenities.includes(f);
              return (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleAmenity(f)}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: active ? "var(--color-accent)" : "transparent",
                    color: active ? "#fff" : "var(--color-text-secondary)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              );
            })}
            {amenities
              .filter((f) => !SUGGESTED_VENUE_AMENITIES.includes(f))
              .map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleAmenity(f)}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--color-accent)",
                    background: "var(--color-accent)",
                    color: "#fff",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {f} ✕
                </button>
              ))}
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            <input
              placeholder="Custom feature…"
              value={customAmenity}
              onChange={(e) => setCustomAmenity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomAmenity();
                }
              }}
              style={{ ...inputStyle, width: "auto", flex: "1 1 200px" }}
            />
            <button type="button" onClick={addCustomAmenity} style={ghostButtonStyle}>
              + Add
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Photos & video</h2>
          <p style={sectionSubtitleStyle}>
            High-resolution photos make the biggest difference in proposals — aim for at least 1200px wide.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--color-accent)" : "var(--color-border)"}`,
              borderRadius: "var(--radius-md)",
              padding: "var(--space-8)",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--color-surface)" : "transparent",
              color: "var(--color-text-secondary)",
            }}
          >
            <div style={{ fontSize: "1.5rem" }}>⌁</div>
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "0.9rem" }}>
              Drag photos or videos here, or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </div>

          {media.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "var(--space-4)",
                marginTop: "var(--space-5)",
              }}
            >
              {media.map((m) => (
                <div
                  key={m.key}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                    background: "var(--color-surface)",
                  }}
                >
                  <div style={{ position: "relative", width: "100%", height: "120px", background: "#000" }}>
                    {m.kind === "video" ? (
                      <video src={m.previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.previewUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                    {m.lowRes && (
                      <span
                        style={{
                          position: "absolute",
                          top: "var(--space-2)",
                          left: "var(--space-2)",
                          padding: "2px var(--space-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.65rem",
                          background: "var(--color-warning)",
                          color: "#fff",
                        }}
                        title="Under 1200px wide — a larger photo will look sharper in proposals"
                      >
                        Low res
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(m.key)}
                      style={{
                        position: "absolute",
                        top: "var(--space-2)",
                        right: "var(--space-2)",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        border: "none",
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ padding: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    <select
                      value={m.kind}
                      onChange={(e) => updateMediaField(m.key, { kind: e.target.value as MediaKind })}
                      style={{ ...inputStyle, padding: "var(--space-1)", fontSize: "0.75rem" }}
                    >
                      <option value="photo">Photo</option>
                      <option value="video">Video</option>
                      <option value="floor_plan">Floor plan</option>
                    </select>
                    <input
                      placeholder="Caption (optional)"
                      value={m.caption}
                      onChange={(e) => updateMediaField(m.key, { caption: e.target.value })}
                      style={{ ...inputStyle, padding: "var(--space-1)", fontSize: "0.75rem" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
        {progress && <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>{progress}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{
            alignSelf: "flex-start",
            padding: "var(--space-3) var(--space-8)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-pill)",
            fontWeight: 600,
            fontSize: "0.85rem",
            letterSpacing: "0.02em",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Creating…" : "Create venue"}
        </button>
      </form>
    </main>
  );
}

const ghostButtonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-4)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
  fontSize: "0.85rem",
};
