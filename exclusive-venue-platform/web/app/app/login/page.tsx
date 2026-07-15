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

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          width: "320px",
          padding: "var(--space-8)",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Staff sign in</h1>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            suppressHydrationWarning
            style={{
              padding: "var(--space-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            suppressHydrationWarning
            style={{
              padding: "var(--space-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </label>

        {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "var(--space-2)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
