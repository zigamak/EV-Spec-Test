"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import PageLoader from "@/components/PageLoader";
import type { Currency, LandlordPaymentAccount, LandlordPaymentAccountUpsert } from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
  width: "100%",
};

/**
 * Landlord payout account (task C3) — self-service, manual only. Stripe
 * Connect is explicitly deferred (erd.md §6a: Thailand-based Connect
 * accounts can't self-serve Express onboarding, researched live during
 * planning) — the landlord enters their own bank details directly, staff
 * verifies manually outside the app, actual payout stays a manual bank
 * transfer. This form is always the landlord's OWN record (GET/PUT
 * /landlord/payment-account) — RLS guarantees that, so the account
 * number is never masked here, only when staff view someone else's.
 */
export default function LandlordPayoutsPage() {
  const [account, setAccount] = useState<LandlordPaymentAccount | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<LandlordPaymentAccountUpsert>({
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
      apiFetch<LandlordPaymentAccount | null>("/landlord/payment-account"),
      apiFetch<Currency[]>("/currencies"),
    ])
      .then(([acc, curr]) => {
        setCurrencies(curr);
        if (acc) {
          setAccount(acc);
          setForm({
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
        setError(err instanceof ApiError ? err.message : "Failed to load payout details");
        setLoaded(true);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await apiFetch<LandlordPaymentAccount>("/landlord/payment-account", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setAccount(saved);
      setSaveMessage("Saved — staff will verify your details before payouts begin.");
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <PageLoader label="Loading payout settings" />;

  return (
    <main style={{ maxWidth: "560px", margin: "0 auto", padding: "var(--space-8) var(--space-6)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "1.6rem", marginBottom: "var(--space-2)" }}>
        Payout settings
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Manual bank transfer only — enter your details below and staff will verify them before your
        first payout.
      </p>

      {account && (
        <div
          style={{
            marginBottom: "var(--space-5)",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: account.status === "verified" ? "var(--color-navy)" : "var(--color-warning)",
          }}
        >
          Status: {account.status === "verified" ? "Verified" : "Pending verification"}
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Bank name</span>
          <input
            style={inputStyle}
            value={form.bank_name ?? ""}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Account holder name</span>
          <input
            style={inputStyle}
            value={form.account_holder_name ?? ""}
            onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Account number</span>
          <input
            style={inputStyle}
            value={form.account_number ?? ""}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>SWIFT/BIC</span>
          <input
            style={inputStyle}
            value={form.swift_bic ?? ""}
            onChange={(e) => setForm({ ...form, swift_bic: e.target.value })}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Payout currency</span>
          <select
            style={inputStyle}
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
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
            style={{
              padding: "var(--space-2) var(--space-5)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-pill)",
              cursor: saving ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : "Save payout details"}
          </button>
        </div>
        {saveMessage && <p style={{ fontSize: "0.85rem" }}>{saveMessage}</p>}
      </form>
    </main>
  );
}
