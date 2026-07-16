"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/app", label: "Pipeline" },
  { href: "/app/venues", label: "Venues" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/calendar", label: "Calendar" },
];

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return initials.join("") || email.slice(0, 2).toUpperCase();
}

/**
 * Staff shell (/app/*) — dark navy sidebar, built toward the reference
 * screenshots the client shared (16 Jul). Session + role enforcement
 * happens in web/middleware.ts before a request ever reaches this layout
 * — this is just the shared chrome, not a second auth check. Hidden on
 * /app/login since that route is reachable while unauthenticated.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = pathname !== "/app/login";
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!showNav) return;
    createClient()
      .auth.getSession()
      .then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, [showNav]);

  if (!showNav) {
    return <div style={{ minHeight: "100vh" }}>{children}</div>;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--color-surface)" }}>
      <aside
        style={{
          width: "var(--sidebar-width)",
          flexShrink: 0,
          background: "var(--color-navy)",
          color: "var(--color-navy-text)",
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-6) var(--space-5)",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "0 var(--space-2)" }}>
          <span style={{ fontSize: "1.3rem" }} aria-hidden>
            🔑
          </span>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem" }}>Exclusive Venue</span>
        </div>

        <nav style={{ marginTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  color: active ? "#fff" : "var(--color-navy-text-muted)",
                  background: active ? "var(--color-navy-hover)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/app?new=1"
          style={{
            marginTop: "var(--space-6)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "var(--radius-pill)",
            textAlign: "center",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          + New Enquiry
        </Link>

        <div style={{ flex: 1 }} />

        {email && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "0 var(--space-2)" }}>
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--color-accent)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initialsFromEmail(email)}
            </span>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "0.85rem", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {email}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-navy-text-muted)" }}>Staff</div>
            </div>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
