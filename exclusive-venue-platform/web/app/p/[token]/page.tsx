"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PublicProposal } from "@/lib/api/types";

/**
 * Public, read-only proposal page (task G5) — the destination of a shareable
 * link (/p/{token}). Unauthenticated by design: it fetches the narrowed
 * GET /public/proposals/{token} (service-role behind a validated token), so
 * NO Supabase session and no apiFetch (which would redirect to login). Lives
 * outside /app so middleware doesn't gate it.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function PublicProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/public/proposals/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? (res.status === 410 ? "This link is no longer active." : "Proposal not found."));
        }
        return res.json();
      })
      .then((data: PublicProposal) => !cancelled && setProposal(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load this proposal."));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const money = (n: number, ccy: string) => `${ccy} ${Number(n).toLocaleString()}`;

  if (error) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-surface)", padding: "var(--space-8)" }}>
        <div style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", marginBottom: "var(--space-2)" }}>{error}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Please contact your Exclusive Venue coordinator.</div>
        </div>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
        Loading…
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--color-surface)" }}>
      {/* Branded header */}
      <header style={{ background: "var(--color-navy)", color: "var(--color-navy-text)", padding: "var(--space-10) var(--space-8)" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span aria-hidden style={{ width: "30px", height: "30px", border: "1.5px solid var(--color-navy-text)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: "var(--color-navy-text)" }} />
            </span>
            <span style={{ fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>
              Exclusive Venue · Proposal
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "2.4rem", margin: "var(--space-5) 0 0", color: "#e0a3ad" }}>
            {proposal.title}
          </h1>
        </div>
      </header>

      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "var(--space-8)" }}>
        {proposal.intro_copy && (
          <p style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", lineHeight: 1.6, color: "var(--color-navy)", maxWidth: "640px" }}>
            {proposal.intro_copy}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-8)" }}>
          {proposal.venues.map((v, i) => (
            <div key={v.venue_id} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "var(--space-6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                    Option · {String(i + 1).padStart(2, "0")}
                    {v.recommended ? " · Recommended" : ""}
                  </div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", marginTop: "2px" }}>{v.venue_name}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{v.configuration_name}</div>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 600 }}>
                  {money(v.quote_total, proposal.currency)}
                </div>
              </div>
              {v.venue_copy && (
                <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "var(--space-4) 0 0" }}>{v.venue_copy}</p>
              )}
            </div>
          ))}
        </div>

        {proposal.legal_boilerplate && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-8)", lineHeight: 1.6 }}>
            {proposal.legal_boilerplate}
          </p>
        )}
      </div>
    </main>
  );
}
