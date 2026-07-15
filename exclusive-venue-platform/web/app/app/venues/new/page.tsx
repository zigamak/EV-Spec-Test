"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Venue, VenueCreate } from "@/lib/api/types";
import { slugify } from "@/lib/utils";

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

/** Venue create form (task B4). Configurations + restrictions are added
 * after creation, on the edit page — a venue needs an id first. */
export default function NewVenuePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
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
    };
    try {
      const venue = await apiFetch<Venue>("/venues", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/app/venues/${venue.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create venue");
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "640px", margin: "0 auto" }}>
      <Link href="/app/venues" style={{ color: "var(--color-text-secondary)" }}>
        ← Venue Library
      </Link>

      <h1 style={{ marginTop: "var(--space-4)" }}>New venue</h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-6)" }}
      >
        <div>
          <label style={labelStyle} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            style={inputStyle}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
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
          <label style={labelStyle} htmlFor="district">
            District
          </label>
          <input id="district" style={inputStyle} value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle} htmlFor="address">
            Address
          </label>
          <input id="address" style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          {saving ? "Creating…" : "Create venue"}
        </button>
      </form>
    </main>
  );
}
