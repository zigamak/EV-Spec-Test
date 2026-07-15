"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Staff shell (/app/*). Session + role enforcement happens in
 * web/middleware.ts before a request ever reaches this layout — this is
 * just the shared chrome, not a second auth check. The nav is hidden on
 * /app/login since that route is reachable while unauthenticated.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = pathname !== "/app/login";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-surface)" }}>
      {showNav && (
        <nav
          style={{
            display: "flex",
            gap: "var(--space-5)",
            padding: "var(--space-4) var(--space-8)",
            background: "var(--color-bg)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <Link href="/app" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
            Pipeline
          </Link>
          <Link href="/app/venues" style={{ color: "var(--color-text-primary)" }}>
            Venues
          </Link>
          <Link href="/app/clients" style={{ color: "var(--color-text-primary)" }}>
            Clients
          </Link>
          <Link href="/app/calendar" style={{ color: "var(--color-text-primary)" }}>
            Calendar
          </Link>
        </nav>
      )}
      {children}
    </div>
  );
}
