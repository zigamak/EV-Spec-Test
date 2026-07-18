"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sidebar structure follows the Operator Console design brief (WORKSPACE /
 * INVENTORY groups, in the reference order). `href` present = a built,
 * navigable route; `href` omitted = shown but not yet built (rendered muted
 * with a "Soon" tag rather than linking to a 404). The flow deliberately
 * leads with Inquiries — every downstream surface hangs off an enquiry.
 *
 * Count badges from the reference screenshot are intentionally NOT shown:
 * they'd be fabricated numbers until wired to real per-section counts
 * (constitution — internal surfaces still never invent data). Add them back
 * once each section can report a real count.
 */
interface NavItem {
  label: string;
  href?: string;
  match?: (pathname: string) => boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard" },
      {
        label: "Inquiries",
        href: "/app/enquiries",
        match: (p) => p.startsWith("/app/enquiries"),
      },
      { label: "Proposals", href: "/app/proposals" },
      { label: "Pipeline", href: "/app", match: (p) => p === "/app" },
      { label: "Clients", href: "/app/clients" },
      { label: "Contacts" },
      { label: "Calendar Booking", href: "/app/calendar" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Venues", href: "/app/venues" },
      { label: "Pricing rules" },
    ],
  },
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

  // Inactivity logout: while the operator is active the Supabase client keeps
  // the session refreshed (they stay signed in — no more mid-use logouts).
  // We only sign out after a genuine idle stretch, resetting on any activity.
  useEffect(() => {
    if (!showNav) return;
    const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours of no activity
    let timer: ReturnType<typeof setTimeout>;
    const logout = async () => {
      await createClient().auth.signOut();
      window.location.href = "/app/login";
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, IDLE_LIMIT_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "0 var(--space-2)" }}>
          <span
            aria-hidden
            style={{
              width: "34px",
              height: "34px",
              flexShrink: 0,
              border: "1.5px solid var(--color-navy-text)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--color-navy-text)" }} />
          </span>
          <span style={{ lineHeight: 1.1 }}>
            <span style={{ display: "block", fontFamily: "var(--font-serif)", fontSize: "1.2rem" }}>
              Exclusive&middot;Venue
            </span>
            <span
              style={{
                display: "block",
                fontSize: "0.6rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-navy-text-muted)",
                marginTop: "2px",
              }}
            >
              Operator
            </span>
          </span>
        </div>

        <nav style={{ marginTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: "0.6rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-navy-text-muted)",
                  padding: "0 var(--space-3)",
                  marginBottom: "var(--space-3)",
                }}
              >
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {group.items.map((item) => {
                  const built = Boolean(item.href);
                  const active =
                    built && (item.match ? item.match(pathname) : pathname.startsWith(item.href!));

                  const rowStyle: React.CSSProperties = {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-2) var(--space-3)",
                    // Burgundy left bar on the active row (reference screenshot);
                    // transparent keeps text alignment identical when inactive.
                    borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                    color: active ? "#fff" : "var(--color-navy-text-muted)",
                    background: active ? "var(--color-navy-hover)" : "transparent",
                    fontWeight: active ? 600 : 400,
                    fontSize: "0.9rem",
                    textDecoration: "none",
                  };

                  if (!built) {
                    // Not yet a route — rendered like any inactive item (no
                    // link, no badge) rather than navigating to a 404.
                    return (
                      <div key={item.label} aria-disabled style={{ ...rowStyle, cursor: "default" }}>
                        <span>{item.label}</span>
                      </div>
                    );
                  }

                  return (
                    <Link key={item.label} href={item.href!} style={rowStyle}>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <Link
          href="/app?new=1"
          style={{
            marginTop: "var(--space-6)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            textAlign: "center",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.7rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
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
