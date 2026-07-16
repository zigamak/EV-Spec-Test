"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Staff login (task A2). Blocks every other authenticated /app/* route
 * (web/middleware.ts). No self-registration — accounts are created via the
 * Supabase dashboard only (route-architecture.md, out-of-scope §9).
 */
export default function LoginPage() {
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("Invalid email or password.");
      return;
    }

    router.push(searchParams.get("redirect") ?? "/app");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    padding: "var(--space-3)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    font: "inherit",
  };

  return (
    <main style={{ display: "flex", minHeight: "100vh" }}>
      <div
        style={{
          flex: "1 1 55%",
          display: "flex",
          alignItems: "flex-end",
          padding: "var(--space-10)",
          background:
            "radial-gradient(circle at 30% 20%, #2a2f52 0%, var(--color-navy) 55%, #0a0d1e 100%)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            color: "#fff",
            fontSize: "1.75rem",
            lineHeight: 1.3,
            maxWidth: "480px",
            margin: 0,
          }}
        >
          The back-office for Hong Kong&apos;s most exclusive spaces.
        </p>
      </div>

      <div
        style={{
          flex: "1 1 45%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--space-10)",
          background: "var(--color-bg)",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%", maxWidth: "380px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ fontSize: "1.3rem" }} aria-hidden>
              🔑
            </span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem" }}>Exclusive Venue</span>
          </div>

          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.75rem", margin: "var(--space-4) 0 0" }}>
              Sign in
            </h1>
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
              Internal operations platform — staff access only.
            </p>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@exclusive-venue.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              suppressHydrationWarning
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
              suppressHydrationWarning
              style={inputStyle}
            />
          </label>

          <div style={{ textAlign: "right" }}>
            <a href="#" style={{ fontSize: "0.85rem", color: "var(--color-accent)" }}>
              Forgot password?
            </a>
          </div>

          {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

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
              fontSize: "1rem",
            }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
