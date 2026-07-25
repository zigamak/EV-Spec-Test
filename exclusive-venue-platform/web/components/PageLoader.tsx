"use client";

import ThinkingOrb from "./ThinkingOrb";

/** Shared "still loading" indicator — replaces a bare "Loading…" string
 * everywhere a page/section waits on its first fetch. Quiet on purpose:
 * a small thinking-orb icon (see ThinkingOrb.tsx) plus an italic serif
 * label. This is a UI nicety only — it makes a real wait *feel* less
 * dead, it doesn't make the underlying request any faster (see
 * api/app/core/auth.py's and scoped_client.py's docstrings for what
 * actually drives load time).
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
      <ThinkingOrb size={18} />
      <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "0.95rem" }}>
        {label}…
      </span>
    </div>
  );
}
