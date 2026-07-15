"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { STAGE_LABEL, type Contact, type Enquiry, type Organisation, type Proposal } from "@/lib/api/types";

/** Client profile (task J1) — read-only, chronological enquiry/proposal
 * history for a contact. Built entirely from existing tables; no writes,
 * no new tables. Enquiries/proposals are fetched in full and filtered
 * client-side since neither list endpoint has a contact_id filter (this
 * page's read volume doesn't warrant adding one yet). */
export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const contactId = params.id;

  const [contact, setContact] = useState<Contact | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const contactData = await apiFetch<Contact>(`/contacts/${contactId}`);
        setContact(contactData);
        if (contactData.organisation_id) {
          const org = await apiFetch<Organisation>(`/organisations/${contactData.organisation_id}`).catch(
            () => null,
          );
          setOrganisation(org);
        }
        const allEnquiries = await apiFetch<Enquiry[]>("/enquiries");
        const ownEnquiries = allEnquiries.filter((e) => e.contact_id === contactId);
        setEnquiries(ownEnquiries);

        const allProposals = await apiFetch<Proposal[]>("/proposals");
        const ownEnquiryIds = new Set(ownEnquiries.map((e) => e.id));
        setProposals(allProposals.filter((p) => ownEnquiryIds.has(p.enquiry_id)));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load client");
      }
    }
    load();
  }, [contactId]);

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
      </main>
    );
  }

  if (!contact) {
    return (
      <main style={{ padding: "var(--space-8)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  const timeline = [
    ...enquiries.map((e) => ({ date: e.created_at, kind: "enquiry" as const, item: e })),
    ...proposals.map((p) => ({ date: p.created_at, kind: "proposal" as const, item: p })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <main style={{ padding: "var(--space-8)", maxWidth: "760px", margin: "0 auto" }}>
      <Link href="/app/clients" style={{ color: "var(--color-text-secondary)" }}>
        ← Clients
      </Link>

      <h1 style={{ marginTop: "var(--space-4)" }}>{contact.full_name}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        {contact.email ?? "No email"} {contact.phone ? `· ${contact.phone}` : ""}
        {organisation ? ` · ${organisation.name}` : ""}
      </p>

      <section style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontSize: "1.1rem" }}>History</h2>
        {timeline.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No enquiries or proposals yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {timeline.map((entry) =>
              entry.kind === "enquiry" ? (
                <li
                  key={`enquiry-${entry.item.id}`}
                  style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border)" }}
                >
                  <Link href={`/app/enquiries/${entry.item.id}`} style={{ color: "var(--color-accent)" }}>
                    Enquiry — {STAGE_LABEL[entry.item.stage]}
                  </Link>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {new Date(entry.date).toLocaleDateString()} · {entry.item.channel}
                  </div>
                </li>
              ) : (
                <li
                  key={`proposal-${entry.item.id}`}
                  style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border)" }}
                >
                  Proposal — {entry.item.title} ({entry.item.status})
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {new Date(entry.date).toLocaleDateString()}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
