"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type {
  Currency,
  Payout,
  VendorPaymentAccount,
  VendorPaymentAccountUpsert,
  VendorPayoutMethod,
} from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  width: "100%",
};

/**
 * Vendor payout settings (task I3/H2) — payout_method is a per-vendor
 * setting (manual or stripe_connect), not a build-wide choice, per
 * erd.md §6b. The Stripe Connect option is shown here as a real choice
 * even though the onboarding flow behind it (redirect to Stripe-hosted
 * Express onboarding) isn't built yet — selecting it just records the
 * intent; actual Connect account creation is a follow-up.
 */
export default function VendorPayoutsPage() {
  const [account, setAccount] = useState<VendorPaymentAccount | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<VendorPaymentAccountUpsert>({
    payout_method: "manual",
    bank_name: "",
    account_holder_name: "",
    account_number: "",
    swift_bic: "",
    currency: "HKD",
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<VendorPaymentAccount | null>("/vendor/payment-account"),
      apiFetch<Currency[]>("/currencies"),
      apiFetch<Payout[]>("/payouts"),
    ])
      .then(([acc, curr, payoutRows]) => {
        setCurrencies(curr);
        setPayouts(payoutRows);
        if (acc) {
          setAccount(acc);
          setForm({
            payout_method: acc.payout_method,
            bank_name: acc.bank_name ?? "",
            account_holder_name: acc.account_holder_name ?? "",
            account_number: acc.account_number ?? "",
            swift_bic: acc.swift_bic ?? "",
            currency: acc.currency,
          });
        }
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Failed to load payout settings");
        setLoaded(true);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await apiFetch<VendorPaymentAccount>("/vendor/payment-account", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setAccount(saved);
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <PageLoader label="Loading payout settings" />;

  return (
    <main style={{ maxWidth: "560px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-6)" }}>
        Payout settings
      </h1>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Payout method</span>
          <select
            style={inputStyle}
            value={form.payout_method}
            onChange={(e) => setForm({ ...form, payout_method: e.target.value as VendorPayoutMethod })}
          >
            <option value="manual">Manual bank transfer</option>
            <option value="stripe_connect">Stripe Connect</option>
          </select>
        </label>

        {form.payout_method === "manual" ? (
          <>
            <input placeholder="Bank name" value={form.bank_name ?? ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} style={inputStyle} />
            <input placeholder="Account holder name" value={form.account_holder_name ?? ""} onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })} style={inputStyle} />
            <input placeholder="Account number" value={form.account_number ?? ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} style={inputStyle} />
            <input placeholder="SWIFT/BIC" value={form.swift_bic ?? ""} onChange={(e) => setForm({ ...form, swift_bic: e.target.value })} style={inputStyle} />
          </>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Stripe Connect onboarding isn't wired up in this build yet — selecting this records your
            preference; staff will follow up to complete setup.
          </p>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Payout currency</span>
          <select style={inputStyle} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{ padding: "var(--space-2) var(--space-5)", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer", fontWeight: 600 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMessage && <span style={{ marginLeft: "var(--space-3)", fontSize: "0.85rem" }}>{saveMessage}</span>}
        </div>
      </form>

      {account && (
        <p style={{ marginTop: "var(--space-3)", fontSize: "0.85rem", fontWeight: 600 }}>
          Status: {account.status}
        </p>
      )}

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1rem" }}>Payout history</h2>
        {payouts.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>No payouts yet.</p>}
        {payouts.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)", fontSize: "0.9rem" }}>
            <span>{p.currency} {p.net_amount.toLocaleString()}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{p.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
