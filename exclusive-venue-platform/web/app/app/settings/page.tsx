"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMe } from "@/lib/useMe";
import PageLoader from "@/components/PageLoader";

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-bg)",
  padding: "var(--space-6)",
  maxWidth: "480px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--color-border)",
};

/** Settings (Workspace nav) — v1 is deliberately small: account identity
 * + sign out. Real preferences (notifications, theme, defaults) land
 * later once there's an actual need for them, per the "build what's
 * asked for, not speculative future requirements" rule — this page
 * exists now mainly so sign-out has a durable, discoverable home beyond
 * the sidebar dropdown. */
export default function SettingsPage() {
  const me = useMe();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/app/login";
  }

  if (!me || !email) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <PageLoader label="Loading settings" />
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-8)" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "2.25rem" }}>
        Settings
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
        Your account on Exclusive Venue.
      </p>

      <div style={{ marginTop: "var(--space-6)" }}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "1.05rem" }}>Account</h2>
          <div style={rowStyle}>
            <span style={{ color: "var(--color-text-muted)" }}>Name</span>
            <span>{me.full_name ?? "—"}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "var(--color-text-muted)" }}>Email</span>
            <span>{email}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Role</span>
            <span style={{ textTransform: "capitalize" }}>{me.role}</span>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: "var(--space-5)" }}>
          <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "1.05rem" }}>Switch account</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: "0 0 var(--space-4)" }}>
            Sign out of {email} to log in as someone else.
          </p>
          <button
            onClick={handleLogout}
            style={{
              padding: "var(--space-3) var(--space-6)",
              background: "var(--color-danger)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </main>
  );
}
