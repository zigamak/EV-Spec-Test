"use client";

/** "Thinking orb" — a ring of dots pulsing in sequence, on-brand
 * navy/burgundy. Inspired by github.com/Jakubantalik/thinking-orbs'
 * dotted-orb concept for AI/agent UIs, but built from scratch: that
 * library is strictly monochrome (light/dark dots only, no custom hue),
 * which wouldn't carry this app's brand colors. Same idea — a small
 * animated "something is happening" orb — in our own palette instead.
 *
 * Two uses: the default `PageLoader` icon (any page/section still
 * loading), and standalone next to "Generate with AI" buttons while an
 * actual AI call is in flight (proposal intro/venue copy) — the same
 * visual language should read as "the AI is thinking" in both places. */

const DOT_COUNT = 8;

export default function ThinkingOrb({ size = 20 }: { size?: number }) {
  const center = size / 2;
  const radius = size * 0.36;
  const dotRadius = Math.max(size * 0.07, 1.5);
  const duration = 1.2; // seconds per full lap around the ring

  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle = (i / DOT_COUNT) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: center + radius * Math.cos(angle),
      cy: center + radius * Math.sin(angle),
      delay: (i / DOT_COUNT) * duration,
      accent: i % 2 === 0,
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .thinking-orb-dot { animation: thinking-orb-pulse ${duration}s ease-in-out infinite; }
        }
        @keyframes thinking-orb-pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {dots.map((d, i) => (
        <circle
          key={i}
          className="thinking-orb-dot"
          cx={d.cx}
          cy={d.cy}
          r={dotRadius}
          fill={d.accent ? "var(--color-accent)" : "var(--color-navy)"}
          style={{ animationDelay: `${d.delay}s`, transformOrigin: `${d.cx}px ${d.cy}px` }}
        />
      ))}
    </svg>
  );
}
