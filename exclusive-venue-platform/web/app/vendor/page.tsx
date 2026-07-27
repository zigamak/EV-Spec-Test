"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import PageLoader from "@/components/PageLoader";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABEL,
  type Currency,
  type Vendor,
  type VendorCategory,
  type VendorCreate,
  type VendorService,
  type VendorServiceCreate,
  type VendorServicePricingType,
  type VendorUpdate,
} from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  width: "100%",
};

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const STATUS_LABEL: Record<Vendor["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  suspended: "Suspended",
};

/**
 * Vendor dashboard home (task I3): own listing + services management.
 * Reads GET /vendors (RLS-scoped to owner_user_id — a vendor caller only
 * ever sees their own row(s)). If none exist yet, shows a create form
 * (Path B-equivalent to Product 3's landlord self-add — a vendor
 * application starts 'pending_approval', cannot self-activate).
 */
export default function VendorDashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [services, setServices] = useState<VendorService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [applyForm, setApplyForm] = useState<{ business_name: string; category: VendorCategory }>({
    business_name: "",
    category: "florist",
  });
  const [applying, setApplying] = useState(false);

  const [editForm, setEditForm] = useState<VendorUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [newService, setNewService] = useState<VendorServiceCreate>({
    name: "",
    pricing_type: "flat",
    amount: 0,
    currency: "HKD",
  });
  const [addingService, setAddingService] = useState(false);

  function loadVendor() {
    setError(null);
    apiFetch<Vendor[]>("/vendors")
      .then((rows) => {
        const own = rows[0] ?? null;
        setVendor(own);
        if (own) {
          setEditForm({ business_name: own.business_name, description: own.description, address: own.address, district: own.district });
          apiFetch<VendorService[]>(`/vendors/${own.id}/services`).then(setServices).catch(() => {});
        }
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Failed to load your listing");
        setLoaded(true);
      });
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    apiFetch<Currency[]>("/currencies").then(setCurrencies).catch(() => {});
    loadVendor();
  }, []);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setApplying(true);
    try {
      const body: VendorCreate = {
        business_name: applyForm.business_name,
        slug: `${slugify(applyForm.business_name)}-${Date.now().toString(36)}`,
        category: applyForm.category,
        owner_user_id: userId,
        status: "pending_approval",
      };
      await apiFetch<Vendor>("/vendors", { method: "POST", body: JSON.stringify(body) });
      loadVendor();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit application");
    } finally {
      setApplying(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await apiFetch<Vendor>(`/vendors/${vendor.id}`, { method: "PATCH", body: JSON.stringify(editForm) });
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setAddingService(true);
    try {
      const body: VendorServiceCreate = {
        ...newService,
        amount: newService.pricing_type === "quote" ? null : newService.amount,
      };
      await apiFetch<VendorService>(`/vendors/${vendor.id}/services`, { method: "POST", body: JSON.stringify(body) });
      setNewService({ name: "", pricing_type: "flat", amount: 0, currency: "HKD" });
      apiFetch<VendorService[]>(`/vendors/${vendor.id}/services`).then(setServices).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add service");
    } finally {
      setAddingService(false);
    }
  }

  if (!loaded) return <PageLoader label="Loading your listing" />;

  if (!vendor) {
    return (
      <main style={{ maxWidth: "480px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem" }}>List your business</h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
          Applications start as pending approval — staff review before your listing goes live.
        </p>
        {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
        <form onSubmit={handleApply} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <input
            placeholder="Business name"
            required
            value={applyForm.business_name}
            onChange={(e) => setApplyForm({ ...applyForm, business_name: e.target.value })}
            style={inputStyle}
          />
          <select
            value={applyForm.category}
            onChange={(e) => setApplyForm({ ...applyForm, category: e.target.value as VendorCategory })}
            style={inputStyle}
          >
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={applying || !applyForm.business_name}
            style={{ padding: "var(--space-3)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}
          >
            {applying ? "Submitting…" : "Apply"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-6)" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", margin: 0 }}>{vendor.business_name}</h1>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: vendor.status === "active" ? "var(--color-navy)" : "var(--color-warning)" }}>
            {STATUS_LABEL[vendor.status]}
          </span>
        </div>
        <nav style={{ display: "flex", gap: "var(--space-4)", fontSize: "0.85rem" }}>
          <Link href="/vendor/orders" style={{ color: "var(--color-accent)" }}>Orders</Link>
          <Link href="/vendor/payouts" style={{ color: "var(--color-accent)" }}>Payouts</Link>
          <Link href="/vendor/coupons" style={{ color: "var(--color-accent)" }}>Coupons</Link>
        </nav>
      </div>

      <section style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Profile</h2>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <textarea
            placeholder="Description"
            value={editForm.description ?? ""}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            style={{ ...inputStyle, minHeight: "80px" }}
          />
          <input
            placeholder="Address"
            value={editForm.address ?? ""}
            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            style={inputStyle}
          />
          <input
            placeholder="District"
            value={editForm.district ?? ""}
            onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
            style={inputStyle}
          />
          <div>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: "var(--space-2) var(--space-4)", background: "var(--color-navy)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saveMessage && <span style={{ marginLeft: "var(--space-3)", fontSize: "0.85rem" }}>{saveMessage}</span>}
          </div>
        </form>
      </section>

      <section style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-5)" }}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Services</h2>
        {services.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}>
            <span>{s.name}</span>
            <span style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
              {s.pricing_type === "quote" ? "Quote only" : `${s.currency} ${s.amount?.toLocaleString()}`}
            </span>
          </div>
        ))}
        <form onSubmit={handleAddService} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            placeholder="Service name"
            required
            value={newService.name}
            onChange={(e) => setNewService({ ...newService, name: e.target.value })}
            style={{ ...inputStyle, flex: 2, width: "auto" }}
          />
          <select
            value={newService.pricing_type}
            onChange={(e) => setNewService({ ...newService, pricing_type: e.target.value as VendorServicePricingType })}
            style={{ ...inputStyle, width: "auto" }}
          >
            <option value="flat">Flat</option>
            <option value="per_head">Per head</option>
            <option value="per_hour">Per hour</option>
            <option value="quote">Quote only</option>
          </select>
          {newService.pricing_type !== "quote" && (
            <input
              type="number"
              min={0}
              placeholder="Amount"
              value={newService.amount ?? ""}
              onChange={(e) => setNewService({ ...newService, amount: Number(e.target.value) })}
              style={{ ...inputStyle, width: "120px" }}
            />
          )}
          <select
            value={newService.currency}
            onChange={(e) => setNewService({ ...newService, currency: e.target.value })}
            style={{ ...inputStyle, width: "auto" }}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addingService || !newService.name}
            style={{ padding: "var(--space-2) var(--space-4)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
          >
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
