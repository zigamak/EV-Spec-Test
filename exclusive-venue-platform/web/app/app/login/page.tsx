"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.72M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.4-1.1" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/**
 * Staff login (task A2). Blocks every other authenticated /app/* route
 * (web/middleware.ts). No self-registration — accounts are created via the
 * Supabase dashboard only (route-architecture.md, out-of-scope §9).
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
            <div style={{ position: "relative", display: "flex" }}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                suppressHydrationWarning
                style={{ ...inputStyle, flex: 1, paddingRight: "var(--space-10)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                style={{
                  position: "absolute",
                  right: "var(--space-2)",
                  top: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 var(--space-2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
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
