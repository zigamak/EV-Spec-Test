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

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="login-spinner">
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Staff login (task A2). Blocks every other authenticated /app/* route
 * (web/middleware.ts). No self-registration — accounts are created via the
 * Supabase dashboard only (route-architecture.md, out-of-scope §9).
 *
 * Redesigned 19 Jul with the UI/UX Pro Max guidance: staggered entrance
 * motion, an ambient (non-distracting) animated hero, real focus/hover/
 * loading states — all built from the same brand tokens as the rest of the
 * app, and every decorative animation gated behind
 * `prefers-reduced-motion: no-preference` so it never runs for anyone who's
 * asked their system to reduce motion.
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
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    width: "100%",
  };

  return (
    <main style={{ display: "flex", minHeight: "100vh" }}>
      <style>{`
        @keyframes loginRise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginDrawUnderline {
          from { width: 0; }
          to { width: 56px; }
        }
        @keyframes loginGridDrift {
          from { background-position: 0 0; }
          to { background-position: 44px 44px; }
        }
        @keyframes loginWatermarkIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 0.07; transform: scale(1); }
        }
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes loginShake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }

        .login-spinner { animation: loginSpin 0.8s linear infinite; }

        .login-input { transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
        .login-input:focus { outline: none; border-color: var(--color-navy); box-shadow: 0 0 0 3px rgba(27, 42, 74, 0.10); }

        .login-eye-btn { transition: color var(--transition-fast); }
        .login-eye-btn:hover { color: var(--color-text-primary); }

        .login-link { position: relative; transition: color var(--transition-fast); }
        .login-link::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px;
          background: var(--color-accent); transform: scaleX(0); transform-origin: right;
          transition: transform var(--transition-base);
        }
        .login-link:hover::after { transform: scaleX(1); transform-origin: left; }

        .login-btn {
          transition: background var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
        }
        .login-btn:hover:not(:disabled) { background: var(--color-accent-hover); box-shadow: var(--shadow-md); }
        .login-btn:active:not(:disabled) { transform: translateY(1px); }
        .login-btn:disabled { cursor: default; opacity: 0.85; }

        .login-hero {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .login-grid {
          position: absolute;
          inset: 0;
          z-index: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.10) 1px, transparent 1px);
          background-size: 26px 26px;
          opacity: 0.5;
          -webkit-mask-image: linear-gradient(to bottom, transparent, black 30%, black 75%, transparent);
          mask-image: linear-gradient(to bottom, transparent, black 30%, black 75%, transparent);
        }
        .login-watermark {
          position: absolute;
          right: -6%;
          top: 50%;
          width: 480px;
          height: 480px;
          transform: translateY(-50%);
          opacity: 0.07;
          z-index: 0;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: no-preference) {
          .login-rise { animation: loginRise 0.55s cubic-bezier(0.16, 1, 0.3, 1) both; }
          .login-underline { animation: loginDrawUnderline 0.7s 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
          .login-grid { animation: loginGridDrift 40s linear infinite; }
          .login-watermark { animation: loginWatermarkIn 1.4s 0.2s cubic-bezier(0.16, 1, 0.3, 1) both; }
          .login-error-shake { animation: loginShake 0.4s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-watermark { opacity: 0.07; }
        }
      `}</style>

      <div
        className="login-hero"
        style={{
          flex: "1 1 55%",
          display: "flex",
          alignItems: "flex-end",
          padding: "var(--space-10)",
          background: "radial-gradient(circle at 30% 20%, #2a2f52 0%, var(--color-navy) 55%, #0a0d1e 100%)",
        }}
      >
        <div className="login-grid" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="" aria-hidden className="login-watermark" />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            className="login-rise"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(242, 240, 237, 0.55)",
              marginBottom: "var(--space-4)",
            }}
          >
            Operator Console
          </div>
          <p
            className="login-rise"
            style={{
              fontFamily: "var(--font-serif)",
              color: "#fff",
              fontSize: "1.85rem",
              lineHeight: 1.3,
              maxWidth: "480px",
              margin: 0,
              animationDelay: "0.08s",
            }}
          >
            The back-office for Hong Kong&apos;s most exclusive spaces.
          </p>
          <div
            className="login-underline"
            style={{ height: "2px", background: "var(--color-accent)", marginTop: "var(--space-5)" }}
          />
        </div>
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
          <div className="login-rise" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span
              style={{
                width: "34px",
                height: "34px",
                flexShrink: 0,
                borderRadius: "var(--radius-sm)",
                background: "var(--color-navy)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.png" alt="" aria-hidden style={{ width: "20px", height: "auto" }} />
            </span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", color: "var(--color-text-primary)" }}>
              Exclusive&middot;Venue
            </span>
          </div>

          <div className="login-rise" style={{ animationDelay: "0.08s" }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.9rem", margin: "var(--space-4) 0 0", color: "var(--color-text-primary)" }}>
              Sign in
            </h1>
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0" }}>
              Internal operations platform, staff access only.
            </p>
          </div>

          <label
            className="login-rise"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)", animationDelay: "0.14s" }}
          >
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@exclusive-venue.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              suppressHydrationWarning
              className="login-input"
              style={inputStyle}
            />
          </label>

          <label className="login-rise" style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", animationDelay: "0.18s" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Password</span>
            <div style={{ position: "relative", display: "flex" }}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                suppressHydrationWarning
                className="login-input"
                style={{ ...inputStyle, paddingRight: "var(--space-10)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="login-eye-btn"
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

          <div className="login-rise" style={{ textAlign: "right", animationDelay: "0.22s" }}>
            <button
              type="button"
              className="login-link"
              style={{
                fontSize: "0.85rem",
                color: "var(--color-accent)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <p
              className="login-error-shake"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                color: "var(--color-danger)",
                margin: 0,
                fontSize: "0.9rem",
              }}
            >
              <AlertIcon />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="login-rise login-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              cursor: submitting ? "default" : "pointer",
              fontWeight: 600,
              fontSize: "1rem",
              boxShadow: "var(--shadow-sm)",
              animationDelay: "0.26s",
            }}
          >
            {submitting && <Spinner />}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
