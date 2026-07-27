"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Vendor login (task I3). Blocks every other /vendor/* route
 * (web/middleware.ts, has_role('vendor')). Tier 1 provisional styling,
 * same as /landlord/login — matches roles/frontend.md's classification
 * of these internal/admin-class dashboards.
 */
export default function VendorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);

    if (signInError) {
      setError("Invalid email or password.");
      return;
    }

    router.push(searchParams.get("redirect") ?? "/vendor");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    padding: "var(--space-3)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    font: "inherit",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    width: "100%",
  };

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface)",
        padding: "var(--space-6)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          width: "100%",
          maxWidth: "380px",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-8)",
        }}
      >
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", margin: 0 }}>
            Vendor dashboard
          </h1>
          <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
            Manage your listing, orders, and payouts.
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && <p style={{ color: "var(--color-danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>}

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
            opacity: submitting ? 0.85 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
