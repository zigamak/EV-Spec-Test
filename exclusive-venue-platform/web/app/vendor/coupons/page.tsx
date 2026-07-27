"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type { Coupon, CouponCreate, Currency, DiscountType, Vendor } from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
};

/**
 * Vendor's own coupons (task I3/E3). RLS scopes GET/POST to this
 * vendor's own vendor_id (coupons_vendor_select_own/insert_own) —
 * platform-wide codes (vendor_id NULL) are staff-only and never visible
 * here at all.
 */
export default function VendorCouponsPage() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [currency, setCurrency] = useState("HKD");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    Promise.all([
      apiFetch<Vendor[]>("/vendors"),
      apiFetch<Coupon[]>("/coupons"),
      apiFetch<Currency[]>("/currencies"),
    ])
      .then(([vendors, couponRows, curr]) => {
        setVendor(vendors[0] ?? null);
        setCoupons(couponRows);
        setCurrencies(curr);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Failed to load coupons");
        setLoaded(true);
      });
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: CouponCreate = {
        code: code.toUpperCase(),
        vendor_id: vendor.id,
        discount_type: discountType,
        discount_value: Number(discountValue),
        currency: discountType === "flat" ? currency : undefined,
      };
      await apiFetch<Coupon>("/coupons", { method: "POST", body: JSON.stringify(body) });
      setCode("");
      setDiscountValue("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create coupon");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <PageLoader label="Loading coupons" />;
  if (!vendor) return <p style={{ padding: "var(--space-6)", color: "var(--color-text-secondary)" }}>Set up your vendor listing first.</p>;

  return (
    <main style={{ maxWidth: "560px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-6)" }}>
        Coupons
      </h1>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-8)" }}>
        <input placeholder="Code (e.g. SPRING10)" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={inputStyle} />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} style={{ ...inputStyle, flex: 1 }}>
            <option value="percentage">Percentage off</option>
            <option value="flat">Flat amount off</option>
          </select>
          <input
            type="number"
            min={0}
            max={discountType === "percentage" ? 100 : undefined}
            required
            placeholder={discountType === "percentage" ? "%" : "Amount"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            style={{ ...inputStyle, width: "100px" }}
          />
          {discountType === "flat" && (
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, width: "80px" }}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting || !code || !discountValue}
          style={{ padding: "var(--space-2) var(--space-4)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
        >
          {submitting ? "Creating…" : "Create coupon"}
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {coupons.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            <span style={{ fontWeight: 600 }}>{c.code}</span>
            <span style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              {c.discount_type === "percentage" ? `${c.discount_value}% off` : `${c.currency} ${c.discount_value} off`} · {c.uses_count} used
            </span>
          </div>
        ))}
        {coupons.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>No coupons yet.</p>}
      </div>
    </main>
  );
}
