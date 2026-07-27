"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABEL, type Vendor, type VendorCategory } from "@/lib/api/types";

/**
 * Public vendor marketplace directory (task I1). Unauthenticated,
 * unauthenticated-by-design (this is the public storefront) — calls
 * GET /vendors/directory directly, no session/apiFetch auth wrapper
 * needed since the endpoint itself requires none.
 *
 * "As detailed as possible... every detail a platform would need to
 * grow" (the original request): category + district filters here are
 * the client-visible half of that; the SEO/location depth lives on each
 * vendor's own profile page (I2), which is what actually needs to be
 * indexable per-vendor, not this listing.
 */
export default function VendorDirectoryPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<VendorCategory | "">("");
  const [districtFilter, setDistrictFilter] = useState("");

  useEffect(() => {
    setError(null);
    setVendors(null);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/vendors/directory?${params}`)
      .then((res) => {
        if (!res.ok) throw new ApiError(res.status, "Failed to load vendors");
        return res.json();
      })
      .then(setVendors)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load vendors"));
  }, [category]);

  const districts = useMemo(
    () => Array.from(new Set((vendors ?? []).map((v) => v.district).filter(Boolean))) as string[],
    [vendors],
  );

  const filtered = useMemo(
    () => (vendors ?? []).filter((v) => !districtFilter || v.district === districtFilter),
    [vendors, districtFilter],
  );

  return (
    <main style={{ maxWidth: "1080px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem", marginBottom: "var(--space-2)" }}>
        Vendor marketplace
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Florists, catering, entertainment, AV, staffing, and decor for your event.
      </p>

      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as VendorCategory | "")}
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            font: "inherit",
          }}
        >
          <option value="">All categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {VENDOR_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        {districts.length > 0 && (
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              font: "inherit",
            }}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {!vendors && !error && <PageLoader label="Loading vendors" />}
      {vendors && filtered.length === 0 && (
        <p style={{ color: "var(--color-text-secondary)" }}>No vendors match these filters yet.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-5)" }}>
        {filtered.map((vendor) => (
          <Link
            key={vendor.id}
            href={`/vendors/${vendor.slug}`}
            style={{
              display: "block",
              padding: "var(--space-5)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-accent)" }}>
              {VENDOR_CATEGORY_LABEL[vendor.category]}
            </div>
            <div style={{ fontWeight: 600, fontSize: "1.1rem", marginTop: "var(--space-1)" }}>{vendor.business_name}</div>
            <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
              {vendor.district ?? vendor.city ?? "Location on request"}
            </div>
            {vendor.description && (
              <p style={{ fontSize: "0.85rem", marginTop: "var(--space-3)", color: "var(--color-text-secondary)" }}>
                {vendor.description.slice(0, 120)}
                {vendor.description.length > 120 ? "…" : ""}
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
