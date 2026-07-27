"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLoader from "@/components/PageLoader";
import { ApiError } from "@/lib/api/client";
import { VENDOR_CATEGORY_LABEL, type Order, type Vendor, type VendorService } from "@/lib/api/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Unauthenticated fetch — these are all public endpoints, no session
 * token to attach (unlike apiFetch, which would redirect to a login this
 * page should never trigger). */
async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Request failed");
  }
  return res.json();
}

const PRICING_LABEL: Record<VendorService["pricing_type"], string> = {
  flat: "flat fee",
  per_head: "per head",
  per_hour: "per hour",
  quote: "request a quote",
};

/**
 * Public vendor profile + checkout (tasks I2/I4). SEO-critical per the
 * original "every detail a platform would need to grow" requirement —
 * meta_title/meta_description exist on the schema for this exact page,
 * though wiring them into Next's <head> is left as a follow-up (this is
 * a client component; real SEO needs a server component or generateMetadata,
 * a bigger structural change than this pass covers).
 *
 * Checkout here is guest-first (task I4's core, not full Stripe Elements
 * yet — see the note above handleSubmit): fills the same POST /orders
 * body the backend expects, including an optional coupon code.
 */
export default function VendorProfilePage() {
  const params = useParams<{ slug: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [services, setServices] = useState<VendorService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<VendorService | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    publicFetch<Vendor>(`/vendors/directory/${params.slug}`)
      .then((v) => {
        setVendor(v);
        return publicFetch<VendorService[]>(`/vendors/${v.id}/services/public`);
      })
      .then(setServices)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Vendor not found"));
  }, [params.slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await publicFetch<Order>("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || null,
          vendor_id: vendor.id,
          vendor_service_id: selectedService?.id ?? null,
          event_date: eventDate || null,
          guest_count: guestCount ? Number(guestCount) : null,
          coupon_code: couponCode || null,
        }),
      });
      setOrderResult(order);
      // Real card payment (Stripe Elements) against POST /payments is
      // deliberately NOT wired up here yet — the backend endpoint exists
      // (app/routers/payments.py), but the frontend checkout UI to
      // actually collect a card is a separate, larger piece of work
      // (task I4's remainder). An order can exist with zero payments
      // (the pay-later/quote path), so this is a valid, complete state,
      // not a broken one.
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)", padding: "var(--space-8)" }}>{error}</p>;
  if (!vendor) return <PageLoader label="Loading vendor" />;

  if (orderResult) {
    return (
      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "var(--space-10) var(--space-6)", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem" }}>Request received</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>
          {vendor.business_name} will follow up{" "}
          {orderResult.subtotal_amount > 0
            ? `— total ${orderResult.currency} ${orderResult.total_amount.toLocaleString()}`
            : "with a quote"}
          .
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-accent)" }}>
        {VENDOR_CATEGORY_LABEL[vendor.category]}
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2rem", margin: "var(--space-2) 0" }}>
        {vendor.business_name}
      </h1>
      <p style={{ color: "var(--color-text-secondary)" }}>
        {[vendor.district, vendor.city].filter(Boolean).join(", ") || "Location on request"}
      </p>
      {vendor.description && <p style={{ marginTop: "var(--space-4)" }}>{vendor.description}</p>}

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Services</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {services.map((service) => (
            <label
              key={service.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "var(--space-3)",
                border: `1px solid ${selectedService?.id === service.id ? "var(--color-accent)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              <span>
                <input
                  type="radio"
                  name="service"
                  checked={selectedService?.id === service.id}
                  onChange={() => setSelectedService(service)}
                  style={{ marginRight: "var(--space-2)" }}
                />
                {service.name}
              </span>
              <span style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                {service.pricing_type === "quote"
                  ? "Request a quote"
                  : `${service.currency} ${service.amount?.toLocaleString()} (${PRICING_LABEL[service.pricing_type]})`}
              </span>
            </label>
          ))}
          {services.length === 0 && (
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
              No listed services yet — submit a request below and they'll follow up directly.
            </p>
          )}
        </div>
      </section>

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>
          {selectedService && selectedService.pricing_type !== "quote" ? "Order" : "Request a quote"}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: "440px" }}>
          <input
            placeholder="Your name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          />
          <input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          />
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{ flex: 1, padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
            />
            <input
              type="number"
              min={1}
              placeholder="Guests"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              style={{ flex: 1, padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
            />
          </div>
          <input
            placeholder="Coupon code (optional)"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "var(--space-3)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              cursor: submitting ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
          {submitError && <p style={{ color: "var(--color-danger)" }}>{submitError}</p>}
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
            No account needed — you can create one later to track this request.
          </p>
        </form>
      </section>
    </main>
  );
}
