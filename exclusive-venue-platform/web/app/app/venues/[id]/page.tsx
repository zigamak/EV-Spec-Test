"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type {
  AvailabilityReason,
  Venue,
  VenueAvailability,
  VenueAvailabilityCreate,
  VenueConfiguration,
  VenueMedia,
  VenueRestriction,
} from "@/lib/api/types";
import { toIsoDate } from "@/lib/utils";

const REASON_COLOR: Record<AvailabilityReason, string> = {
  booked: "var(--color-danger)",
  hold: "var(--color-warning)",
  maintenance: "var(--color-text-muted)",
  landlord_blocked: "var(--color-text-muted)",
  other: "var(--color-text-muted)",
};

const REASONS: AvailabilityReason[] = ["hold", "booked", "maintenance", "landlord_blocked", "other"];

/** Venue Profile — detail view (task B3). Media upload/reorder is B5;
 * this only displays what's already there. Pricing rules tab is F4. */
export default function VenueProfilePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<Venue | null>(null);
  const [configurations, setConfigurations] = useState<VenueConfiguration[]>([]);
  const [restrictions, setRestrictions] = useState<VenueRestriction[]>([]);
  const [media, setMedia] = useState<VenueMedia[]>([]);
  const [availability, setAvailability] = useState<VenueAvailability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [venueData, configData, restrictionData, mediaData, availabilityData] = await Promise.all([
        apiFetch<Venue>(`/venues/${venueId}`),
        apiFetch<VenueConfiguration[]>(`/venues/${venueId}/configurations`),
        apiFetch<VenueRestriction[]>(`/venues/${venueId}/restrictions`),
        apiFetch<VenueMedia[]>(`/venues/${venueId}/media`),
        apiFetch<VenueAvailability[]>(`/venues/${venueId}/availability`),
      ]);
      setVenue(venueData);
      setConfigurations(configData);
      setRestrictions(restrictionData);
      setMedia(mediaData);
      setAvailability(availabilityData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load venue");
    }
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove() {
    setApproving(true);
    try {
      const updated = await apiFetch<Venue>(`/venues/${venueId}/approve`, { method: "POST" });
      setVenue(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  async function handleAddAvailability(payload: VenueAvailabilityCreate) {
    try {
      const created = await apiFetch<VenueAvailability>(`/venues/${venueId}/availability`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAvailability((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add availability block");
    }
  }

  async function handleDeleteAvailability(id: string) {
    try {
      await apiFetch(`/venues/${venueId}/availability/${id}`, { method: "DELETE" });
      setAvailability((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove availability block");
    }
  }

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!venue) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "800px", margin: "0 auto" }}>
      <Link href="/app/venues" style={{ color: "var(--color-text-secondary)" }}>
        ← Venue Library
      </Link>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: "var(--space-4)",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>{venue.name}</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "var(--space-1) 0 0" }}>
            {venue.address ?? "No address on file"}
            {venue.district ? ` · ${venue.district}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              display: "inline-block",
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "0.85rem",
            }}
          >
            {venue.status.replace("_", " ")}
          </span>
          <div style={{ marginTop: "var(--space-2)" }}>
            <Link
              href={`/app/venues/${venueId}/edit`}
              style={{
                display: "inline-block",
                padding: "var(--space-2) var(--space-4)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                textDecoration: "none",
              }}
            >
              Edit
            </Link>
          </div>
          {venue.status === "pending_approval" && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <button
                onClick={handleApprove}
                disabled={approving}
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  background: "var(--color-success)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: approving ? "default" : "pointer",
                }}
              >
                {approving ? "Approving…" : "Approve venue"}
              </button>
            </div>
          )}
        </div>
      </div>

      {venue.description && <p style={{ marginTop: "var(--space-6)" }}>{venue.description}</p>}

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Configurations</h2>
        {configurations.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No layouts added yet.</p>
        ) : (
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            {configurations.map((c) => (
              <li key={c.id}>
                {c.name} — capacity {c.capacity}
                {c.notes ? ` (${c.notes})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Restrictions</h2>
        {restrictions.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No restrictions on file.</p>
        ) : (
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            {restrictions.map((r) => (
              <li key={r.id}>
                {r.kind.replace(/_/g, " ")}
                {r.value ? `: ${r.value}` : ""} — {r.hard ? "hard limit" : "soft preference"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Availability</h2>
        <AvailabilityCalendar
          month={month}
          onMonthChange={setMonth}
          availability={availability}
          onDelete={handleDeleteAvailability}
        />
        <AvailabilityForm onAdd={handleAddAvailability} />
      </section>

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Media</h2>
        {media.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No photos or videos uploaded yet.</p>
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {media.map((m) => (
              <div key={m.id} style={{ width: "140px" }}>
                {m.kind === "photo" && m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.caption ?? ""}
                    style={{
                      width: "100%",
                      height: "100px",
                      objectFit: "cover",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text-muted)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {m.kind}
                  </div>
                )}
                {m.caption && (
                  <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                    {m.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/** Month-view calendar over venue_availability (task B6) — booked and hold
 * (with expiry countdown) windows shown side by side, read-only apart from
 * cancelling a block. New holds are added via AvailabilityForm below. */
function AvailabilityCalendar({
  month,
  onMonthChange,
  availability,
  onDelete,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  availability: VenueAvailability[];
  onDelete: (id: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function windowsOn(day: Date): VenueAvailability[] {
    const iso = toIsoDate(day);
    return availability.filter((a) => iso >= a.starts_on && iso <= a.ends_on);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <button
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          ←
        </button>
        <strong>{MONTH_FORMAT.format(month)}</strong>
        <button
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
        >
          →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--space-1)" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center" }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const windows = windowsOn(day);
          return (
            <div
              key={i}
              style={{
                minHeight: "56px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-1)",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ color: "var(--color-text-muted)" }}>{day.getDate()}</div>
              {windows.map((w) => (
                <div
                  key={w.id}
                  title={
                    w.reason === "hold" && w.hold_expires_at
                      ? `Hold expires ${new Date(w.hold_expires_at).toLocaleString()}${w.note ? ` — ${w.note}` : ""}`
                      : w.note ?? undefined
                  }
                  onClick={() => {
                    if (confirm(`Remove this ${w.reason.replace("_", " ")} block?`)) onDelete(w.id);
                  }}
                  style={{
                    marginTop: "2px",
                    padding: "1px 4px",
                    borderRadius: "3px",
                    background: REASON_COLOR[w.reason],
                    color: "#fff",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w.reason.replace("_", " ")}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvailabilityForm({ onAdd }: { onAdd: (payload: VenueAvailabilityCreate) => Promise<void> }) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState<AvailabilityReason>("hold");
  const [holdExpiresAt, setHoldExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startsOn || !endsOn) return;
    if (reason === "hold" && !holdExpiresAt) return;
    setAdding(true);
    await onAdd({
      starts_on: startsOn,
      ends_on: endsOn,
      reason,
      hold_expires_at: reason === "hold" ? new Date(holdExpiresAt).toISOString() : null,
      note: note.trim() || null,
    });
    setStartsOn("");
    setEndsOn("");
    setHoldExpiresAt("");
    setNote("");
    setAdding(false);
  }

  const fieldStyle: React.CSSProperties = {
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--space-3)" }}
    >
      <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={fieldStyle} required />
      <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} style={fieldStyle} required />
      <select value={reason} onChange={(e) => setReason(e.target.value as AvailabilityReason)} style={fieldStyle}>
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
      {reason === "hold" && (
        <input
          type="datetime-local"
          value={holdExpiresAt}
          onChange={(e) => setHoldExpiresAt(e.target.value)}
          style={fieldStyle}
          required
        />
      )}
      <input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ ...fieldStyle, flex: "1 1 140px" }}
      />
      <button
        type="submit"
        disabled={adding}
        style={{ padding: "var(--space-1) var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", cursor: "pointer" }}
      >
        {adding ? "Adding…" : "Add block"}
      </button>
    </form>
  );
}
