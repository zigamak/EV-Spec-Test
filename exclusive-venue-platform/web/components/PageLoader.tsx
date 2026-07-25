"use client";

/** Shared "still loading" indicator — replaces a bare "Loading…" string
 * everywhere a page/section waits on its first fetch (13 call sites as of
 * this pass). Quiet on purpose: a thin navy-track/burgundy-arc ring plus
 * an italic serif label, matching the same visual language as the login
 * page's own spinner, not a new one. This is a UI nicety only — it makes
 * a real wait *feel* less dead, it doesn't make the underlying request
 * any faster (see api/app/core/auth.py's and scoped_client.py's
 * docstrings for what actually drives load time).
 *
 * `inline` renders compact (for a small section loading inside an
 * already-visible page, e.g. a restrictions list) instead of the default
 * padded block (for a whole page/panel still waiting on data). */
export default function PageLoader({
  label = "Loading",
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        color: "var(--color-text-muted)",
        padding: inline ? 0 : "var(--space-4) 0",
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .page-loader-ring { animation: page-loader-spin 0.9s linear infinite; }
          .page-loader-dot { animation: page-loader-dot 1.3s infinite ease-in-out; }
        }
        @keyframes page-loader-spin { to { transform: rotate(360deg); } }
        @keyframes page-loader-dot { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
      `}</style>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="page-loader-ring">
        <circle cx="12" cy="12" r="9" stroke="var(--color-border)" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "0.95rem" }}>
        {label}
        <span style={{ display: "inline-flex", gap: "2px", marginLeft: "4px", verticalAlign: "middle" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="page-loader-dot"
              style={{
                width: "3px",
                height: "3px",
                borderRadius: "50%",
                background: "currentColor",
                display: "inline-block",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}
