"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type {
  AddonPricingType,
  PricingRule,
  PricingRuleAddon,
  PricingRuleAddonCreate,
  PricingRuleCreate,
  QuoteBreakdown,
} from "@/lib/api/types";

const inputStyle: React.CSSProperties = {
  padding: "var(--space-1) var(--space-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  font: "inherit",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "var(--space-1) var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg)",
  cursor: "pointer",
};

const ADDON_TYPES: AddonPricingType[] = ["flat", "per_head", "per_hour"];

/** Pricing rules editor (task F4) — the rule/add-on/quote-tester UI for one
 * venue. Shared between the Venue edit page's "Pricing rules" section and
 * the standalone /app/pricing-rules picker. Keeps the jsonb tier/adjustment
 * shapes simple for staff entry: one flat per-head rate, three common
 * day-of-week surcharge days, one date-range season surcharge — matches
 * what F2's calculator (app/services/pricing_engine.py) actually reads. */
export default function PricingRulesTab({ venueId }: { venueId: string }) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [addonsByRule, setAddonsByRule] = useState<Record<string, PricingRuleAddon[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PricingRule[]>(`/venues/${venueId}/pricing-rules`);
      setRules(data);
      const addonEntries = await Promise.all(
        data.map(async (rule) => [
          rule.id,
          await apiFetch<PricingRuleAddon[]>(`/venues/${venueId}/pricing-rules/${rule.id}/addons`),
        ] as const),
      );
      setAddonsByRule(Object.fromEntries(addonEntries));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pricing rules");
    }
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateRule(payload: PricingRuleCreate) {
    try {
      const created = await apiFetch<PricingRule>(`/venues/${venueId}/pricing-rules`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRules((prev) => [created, ...prev]);
      setAddonsByRule((prev) => ({ ...prev, [created.id]: [] }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create pricing rule");
    }
  }

  async function handleDeleteRule(ruleId: string) {
    try {
      await apiFetch(`/venues/${venueId}/pricing-rules/${ruleId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove pricing rule");
    }
  }

  async function handleAddAddon(ruleId: string, addon: PricingRuleAddonCreate) {
    try {
      const created = await apiFetch<PricingRuleAddon>(
        `/venues/${venueId}/pricing-rules/${ruleId}/addons`,
        { method: "POST", body: JSON.stringify(addon) },
      );
      setAddonsByRule((prev) => ({ ...prev, [ruleId]: [...(prev[ruleId] ?? []), created] }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add add-on");
    }
  }

  async function handleDeleteAddon(ruleId: string, addonId: string) {
    try {
      await apiFetch(`/venues/${venueId}/pricing-rules/${ruleId}/addons/${addonId}`, { method: "DELETE" });
      setAddonsByRule((prev) => ({
        ...prev,
        [ruleId]: (prev[ruleId] ?? []).filter((a) => a.id !== addonId),
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove add-on");
    }
  }

  return (
    <div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {rules.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>No pricing rules yet.</p>
      ) : (
        rules.map((rule) => (
          <div
            key={rule.id}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>
                  {rule.currency} {rule.base_rate.toLocaleString()} base
                </strong>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  Effective {rule.effective_from} {rule.effective_to ? `→ ${rule.effective_to}` : "→ ongoing"}
                  {rule.min_spend ? ` · min spend ${rule.min_spend.toLocaleString()}` : ""}
                </div>
                {rule.per_head_tiers.length > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                    Per-head: {rule.per_head_tiers.map((t) => `${t.rate_per_head}/head`).join(", ")}
                  </div>
                )}
              </div>
              <button style={smallButtonStyle} onClick={() => handleDeleteRule(rule.id)}>
                Remove
              </button>
            </div>

            <div style={{ marginTop: "var(--space-3)" }}>
              <h4 style={{ fontSize: "0.9rem", margin: "0 0 var(--space-2)" }}>Add-ons</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(addonsByRule[rule.id] ?? []).map((addon) => (
                  <li
                    key={addon.id}
                    style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-1) 0" }}
                  >
                    <span>
                      {addon.name} — {addon.amount} ({addon.pricing_type.replace("_", " ")})
                    </span>
                    <button style={smallButtonStyle} onClick={() => handleDeleteAddon(rule.id, addon.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <AddonForm onAdd={(addon) => handleAddAddon(rule.id, addon)} />
            </div>

            <QuoteTester venueId={venueId} rule={rule} addons={addonsByRule[rule.id] ?? []} />
          </div>
        ))
      )}

      <h4 style={{ fontSize: "0.9rem" }}>New pricing rule</h4>
      <NewRuleForm onCreate={handleCreateRule} />
    </div>
  );
}

function NewRuleForm({ onCreate }: { onCreate: (payload: PricingRuleCreate) => Promise<void> }) {
  const [baseRate, setBaseRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [ratePerHead, setRatePerHead] = useState("");
  const [fridayMultiplier, setFridayMultiplier] = useState("");
  const [saturdayMultiplier, setSaturdayMultiplier] = useState("");
  const [includedHours, setIncludedHours] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!baseRate || !effectiveFrom) return;
    setSaving(true);

    const dayAdjustments: Record<string, number> = {};
    if (fridayMultiplier) dayAdjustments.friday = Number(fridayMultiplier);
    if (saturdayMultiplier) dayAdjustments.saturday = Number(saturdayMultiplier);

    await onCreate({
      base_rate: Number(baseRate),
      effective_from: effectiveFrom,
      min_spend: minSpend ? Number(minSpend) : null,
      per_head_tiers: ratePerHead
        ? [{ min_guests: 0, max_guests: null, rate_per_head: Number(ratePerHead) }]
        : [],
      day_adjustments: dayAdjustments,
      duration_multipliers:
        includedHours && overtimeRate
          ? { included_hours: Number(includedHours), overtime_rate_per_hour: Number(overtimeRate) }
          : {},
    });

    setBaseRate("");
    setEffectiveFrom("");
    setMinSpend("");
    setRatePerHead("");
    setFridayMultiplier("");
    setSaturdayMultiplier("");
    setIncludedHours("");
    setOvertimeRate("");
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-2)" }}>
      <input placeholder="Base rate (HKD)" type="number" min={0} value={baseRate} onChange={(e) => setBaseRate(e.target.value)} style={inputStyle} required />
      <input placeholder="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} style={inputStyle} required />
      <input placeholder="Min spend (optional)" type="number" min={0} value={minSpend} onChange={(e) => setMinSpend(e.target.value)} style={inputStyle} />
      <input placeholder="Per-head rate (optional)" type="number" min={0} value={ratePerHead} onChange={(e) => setRatePerHead(e.target.value)} style={inputStyle} />
      <input placeholder="Friday multiplier e.g. 1.1" type="number" step="0.01" value={fridayMultiplier} onChange={(e) => setFridayMultiplier(e.target.value)} style={inputStyle} />
      <input placeholder="Saturday multiplier e.g. 1.25" type="number" step="0.01" value={saturdayMultiplier} onChange={(e) => setSaturdayMultiplier(e.target.value)} style={inputStyle} />
      <input placeholder="Included hours" type="number" min={0} value={includedHours} onChange={(e) => setIncludedHours(e.target.value)} style={inputStyle} />
      <input placeholder="Overtime rate/hr" type="number" min={0} value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} style={inputStyle} />
      <button type="submit" disabled={saving} style={{ ...smallButtonStyle, gridColumn: "1 / -1" }}>
        {saving ? "Creating…" : "Add pricing rule"}
      </button>
    </form>
  );
}

function AddonForm({ onAdd }: { onAdd: (addon: PricingRuleAddonCreate) => Promise<void> }) {
  const [name, setName] = useState("");
  const [pricingType, setPricingType] = useState<AddonPricingType>("flat");
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    setAdding(true);
    await onAdd({ name: name.trim(), pricing_type: pricingType, amount: Number(amount) });
    setName("");
    setAmount("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
      <input placeholder="Add-on name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <select value={pricingType} onChange={(e) => setPricingType(e.target.value as AddonPricingType)} style={inputStyle}>
        {ADDON_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replace("_", " ")}
          </option>
        ))}
      </select>
      <input placeholder="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
      <button type="submit" disabled={adding} style={smallButtonStyle}>
        Add
      </button>
    </form>
  );
}

function QuoteTester({
  venueId,
  rule,
}: {
  venueId: string;
  rule: PricingRule;
  addons: PricingRuleAddon[];
}) {
  const [guestCount, setGuestCount] = useState("100");
  const [eventDate, setEventDate] = useState("");
  const [durationHours, setDurationHours] = useState("4");
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<QuoteBreakdown>(
        `/venues/${venueId}/pricing-rules/${rule.id}/quote`,
        {
          method: "POST",
          body: JSON.stringify({
            guest_count: Number(guestCount),
            event_date: eventDate,
            duration_hours: Number(durationHours),
            addon_ids: [],
          }),
        },
      );
      setQuote(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Quote failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--color-border)" }}>
      <h4 style={{ fontSize: "0.9rem", margin: "0 0 var(--space-2)" }}>Test quote</h4>
      <form onSubmit={handleTest} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <input type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(e.target.value)} style={{ ...inputStyle, width: "80px" }} />
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} required />
        <input type="number" min={1} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} style={{ ...inputStyle, width: "70px" }} />
        <button type="submit" disabled={loading} style={smallButtonStyle}>
          {loading ? "Calculating…" : "Get quote"}
        </button>
      </form>
      {error && <p style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{error}</p>}
      {quote && (
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
          Total: <strong>{quote.currency} {quote.total.toLocaleString()}</strong>
          {quote.min_spend_applied ? " (min spend applied)" : ""}
        </p>
      )}
    </div>
  );
}
