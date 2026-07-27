"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import { VENDOR_CATEGORY_LABEL, type Coupon, type CouponCreate, type Currency, type Vendor } from "@/lib/api/types";

const STATUS_LABEL: Record<Vendor["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  suspended: "Suspended",
};

/**
 * Staff vendor approval queue + platform-wide coupon management (task
 * I5). New page, not an addition to an existing one — Product 4 has no
 * staff surface at all yet, unlike Product 3 which extended Venue
 * Profile. Cross-vendor order/payout visibility (also part of I5) isn't
 * built on this page yet — staff can already see all orders/payouts via
 * GET /orders and GET /payouts (RLS grants ALL to staff), just no
 * dedicated UI for browsing them cross-vendor yet.
 */
export default function StaffVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponValue, setCouponValue] = useState("");
  const [couponCurrency, setCouponCurrency] = useState("HKD");
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  function load() {
    Promise.all([
      apiFetch<Vendor[]>("/vendors"),
      apiFetch<Coupon[]>("/coupons"),
      apiFetch<Currency[]>("/currencies"),
    ])
      .then(([v, c, curr]) => {
        setVendors(v);
        setCoupons(c.filter((row) => row.vendor_id === null)); // platform-wide only
        setCurrencies(curr);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  async function handleApprove(vendorId: string) {
    setActingOn(vendorId);
    try {
      await apiFetch(`/vendors/${vendorId}/approve`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    } finally {
      setActingOn(null);
    }
  }

  async function handleCreatePlatformCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCreatingCoupon(true);
    try {
      const body: CouponCreate = {
        code: couponCode.toUpperCase(),
        discount_type: "flat",
        discount_value: Number(couponValue),
        currency: couponCurrency,
      };
      await apiFetch<Coupon>("/coupons", { method: "POST", body: JSON.stringify(body) });
      setCouponCode("");
      setCouponValue("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create coupon");
    } finally {
      setCreatingCoupon(false);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)", padding: "var(--space-6)" }}>{error}</p>;
  if (!vendors) return <PageLoader label="Loading vendors" />;

  const pending = vendors.filter((v) => v.status === "pending_approval");
  const others = vendors.filter((v) => v.status !== "pending_approval");

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-6)" }}>
        Vendors
      </h1>

      <section style={{ marginBottom: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Pending approval</h2>
        {pending.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>Nothing pending.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {pending.map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
              <span>
                {v.business_name} <span style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>({VENDOR_CATEGORY_LABEL[v.category]})</span>
              </span>
              <button
                type="button"
                disabled={actingOn === v.id}
                onClick={() => handleApprove(v.id)}
                style={{ padding: "var(--space-1) var(--space-3)", background: "var(--color-navy)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Approve
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>All vendors</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {others.map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)", fontSize: "0.9rem" }}>
              <span>{v.business_name}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>{STATUS_LABEL[v.status]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem" }}>Platform-wide coupons</h2>
        <form onSubmit={handleCreatePlatformCoupon} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
          <input
            placeholder="Code"
            required
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          />
          <input
            type="number"
            min={0}
            placeholder="Amount off"
            required
            value={couponValue}
            onChange={(e) => setCouponValue(e.target.value)}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit", width: "120px" }}
          />
          <select
            value={couponCurrency}
            onChange={(e) => setCouponCurrency(e.target.value)}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creatingCoupon}
            style={{ padding: "var(--space-2) var(--space-4)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
          >
            Create
          </button>
        </form>
        {coupons.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)", fontSize: "0.9rem" }}>
            <span>{c.code}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {c.currency} {c.discount_value} off · {c.uses_count} used
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
