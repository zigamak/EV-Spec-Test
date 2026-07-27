# Product Brief — Product 4: Vendor Marketplace

*Authored directly (no Notion PRD exists yet for this product) — decided in-session 2026-07-27, superseding the "Not yet populated" placeholder. Status: Draft · Build window: Week 6 onward, alongside Product 3. Originally scoped as "Supplier Marketplace" — renamed to "Vendor Marketplace" in-session, since "vendor" is the events-industry standard term for an external service provider (florist, caterer, AV, staffing, decor), where "supplier" reads as B2B/procurement vocabulary.*

## 1. Overview & Problem Statement

Vendors — the external service providers who fulfil the parts of an event a venue itself doesn't (florists, catering, entertainment, AV, staffing, decor) — currently surface inside a proposal only as a static list (`proposal_suppliers`→`proposal_vendors`, tag-matched). There is no public-facing directory where a client can browse vendors directly, no way for a vendor to list their own services and pricing, and no mechanism for money to actually move through the platform when a client books one.

Product 4 builds a real, detailed public marketplace: vendors get a full profile (location, structured pricing, SEO fields) so the directory can actually be found and browsed, not just referenced inside a proposal. Layered on top, by explicit decision, is a full transaction engine — a client can order a vendor's service through the platform, EV takes a service charge (commission), and the vendor gets paid out the remainder. This is a deliberate widening of scope beyond the general Phase-2 deferral for bookings/payments (`erd.md` §9) — scoped specifically to vendor-marketplace transactions, not venue bookings, which remain deferred.

## 2. Goals & Success Metric

**Primary goal:** a client can find a vendor through the public marketplace directory (by category, location, price) and either book their structured-price service directly through the platform or request a quote — without needing a salesperson in the loop.

**Secondary goals:**
- Vendors get a self-service profile detailed enough to actually drive discovery (location/map search, SEO-indexable pages) — not just a listing that only shows up inside an existing proposal.
- Commission (service charge) is calculated consistently and transparently — platform-wide by default, with room for a negotiated per-vendor rate — and never retroactively changes an already-completed order's math.
- Vendor payout is flexible per vendor: manual (bank transfer, staff-executed) or Stripe Connect automatic split, as a per-vendor setting rather than a single platform-wide choice — because Stripe Connect isn't uniformly available (Thailand-based accounts can't self-serve Express onboarding, per the research done for Product 3).
- Ordering doesn't require an account — guest checkout is the default, with an optional `customer` account for anyone who wants order history / saved details.

## 3. Users

- **Vendor (primary, existing role, renamed from "supplier"):** lists their business, services, and pricing; manages their own orders and payout details; cannot self-activate their listing or set their own commission rate.
- **Customer (new, optional role):** browses the public directory, orders a vendor's service (guest or with an account), can view order history if they created an account.
- **Staff/admin (existing role, unchanged):** approves vendor listings, reviews/adjusts commission overrides, manages platform-wide coupons, oversees all orders/payouts across every vendor.
