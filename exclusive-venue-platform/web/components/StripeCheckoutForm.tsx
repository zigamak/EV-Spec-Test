"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * Card entry for a marketplace order (task I4's remaining piece).
 * `clientSecret` comes from POST /payments (app/routers/payments.py) —
 * created once, right after the order itself, when total_amount > 0.
 * Uses Stripe's modern PaymentElement (one element, handles cards +
 * whatever other methods are enabled on the Stripe account) rather than
 * the older CardElement.
 *
 * The publishable key must be set as NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * in web/.env.local — untested live, no Stripe account configured in
 * this environment, same caveat as the backend half (app/routers/
 * payments.py).
 */
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function CheckoutInner({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <PaymentElement />
      {error && <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
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
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export default function StripeCheckoutForm({
  clientSecret,
  onSuccess,
}: {
  clientSecret: string;
  onSuccess: () => void;
}) {
  if (!stripePromise) {
    return (
      <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>
        Payments aren&apos;t configured (missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) — your request
        has still been recorded and the vendor will follow up.
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutInner onSuccess={onSuccess} />
    </Elements>
  );
}
