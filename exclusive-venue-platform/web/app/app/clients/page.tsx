"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { Contact, Organisation } from "@/lib/api/types";

/** Client list (task J1) — read-only, built entirely from existing
 * contacts/organisations tables. No new tables, no write actions. */
export default function ClientsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<Contact[]>("/contacts"), apiFetch<Organisation[]>("/organisations")])
      .then(([contactData, orgData]) => {
        setContacts(contactData);
        setOrganisations(orgData);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load clients"));
  }, []);

  const orgById = useMemo(() => new Map(organisations.map((o) => [o.id, o])), [organisations]);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        orgById.get(c.organisation_id ?? "")?.name.toLowerCase().includes(q),
    );
  }, [contacts, search, orgById]);

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "960px", margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Clients</h1>

      <input
        placeholder="Search name, email, organisation…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "var(--space-2)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          margin: "var(--space-6) 0",
        }}
      />

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {!error && contacts === null && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
      {contacts !== null && filtered.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>No clients found.</p>
      )}

      {filtered.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "var(--space-2)" }}>Name</th>
              <th style={{ padding: "var(--space-2)" }}>Organisation</th>
              <th style={{ padding: "var(--space-2)" }}>Email</th>
              <th style={{ padding: "var(--space-2)" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((contact) => (
              <tr key={contact.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "var(--space-2)" }}>
                  <Link href={`/app/clients/${contact.id}`} style={{ color: "var(--color-accent)" }}>
                    {contact.full_name}
                  </Link>
                </td>
                <td style={{ padding: "var(--space-2)" }}>
                  {orgById.get(contact.organisation_id ?? "")?.name ?? "—"}
                </td>
                <td style={{ padding: "var(--space-2)" }}>{contact.email ?? "—"}</td>
                <td style={{ padding: "var(--space-2)" }}>{contact.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
