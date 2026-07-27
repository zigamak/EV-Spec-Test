"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type { Order } from "@/lib/api/types";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  canceled: "Canceled",
  refunded: "Refunded",
};

/**
 * Vendor's own orders (task I3), including pricing a quote-request order
 * (subtotal_amount=0 when placed — see prd.md §4 step 6/orders.py's
 * PATCH /orders/{id}/quote, which recomputes totals server-side rather
 * than trusting whatever this form sends).
 */
export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  function load() {
    apiFetch<Order[]>("/orders")
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load orders"));
  }

  useEffect(load, []);

  async function handleSetQuote(orderId: string) {
    const amount = Number(quoteInputs[orderId]);
    if (!amount || amount <= 0) return;
    setSubmittingId(orderId);
    try {
      await apiFetch(`/orders/${orderId}/quote`, {
        method: "PATCH",
        body: JSON.stringify({ subtotal_amount: amount }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set quote");
    } finally {
      setSubmittingId(null);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)", padding: "var(--space-6)" }}>{error}</p>;
  if (!orders) return <PageLoader label="Loading orders" />;

  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-6)" }}>
        Orders
      </h1>

      {orders.length === 0 && <p style={{ color: "var(--color-text-secondary)" }}>No orders yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {orders.map((order) => (
          <div key={order.id} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>
                {order.total_amount > 0 || order.subtotal_amount > 0
                  ? `${order.currency} ${order.total_amount.toLocaleString()}`
                  : "Awaiting quote"}
              </span>
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>{STATUS_LABEL[order.status]}</span>
            </div>
            {order.event_date && (
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Event date: {order.event_date} {order.guest_count ? `· ${order.guest_count} guests` : ""}
              </div>
            )}
            {order.subtotal_amount === 0 && order.status === "pending" && (
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                <input
                  type="number"
                  min={0}
                  placeholder="Quote amount"
                  value={quoteInputs[order.id] ?? ""}
                  onChange={(e) => setQuoteInputs({ ...quoteInputs, [order.id]: e.target.value })}
                  style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit", width: "140px" }}
                />
                <button
                  type="button"
                  disabled={submittingId === order.id}
                  onClick={() => handleSetQuote(order.id)}
                  style={{ padding: "var(--space-2) var(--space-4)", background: "var(--color-navy)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                >
                  Send quote
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
