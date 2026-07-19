export type VenueStatus = "draft" | "pending_approval" | "active" | "inactive";
export type VenueCategory =
  | "event_space"
  | "private_property"
  | "commercial_space"
  | "boats_yachts"
  | "member_club";
export type MediaKind = "photo" | "video" | "floor_plan";
export type RestrictionKind =
  | "no_amplified_music"
  | "no_smoking"
  | "no_open_flame"
  | "min_age"
  | "curfew"
  | "no_red_wine"
  | "other";

export interface Venue {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  district: string | null;
  category: VenueCategory | null;
  amenities: string[];
  ideal_for: string[];
  accepted_event_types: string[];
  surface_area_sqft: number | null;
  room_count: number | null;
  access_note: string | null;
  view_note: string | null;
  landlord_id: string | null;
  status: VenueStatus;
  approved_by: string | null;
  approved_at: string | null;
  hero_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueConfiguration {
  id: string;
  venue_id: string;
  name: string;
  capacity: number;
  notes: string | null;
}

export interface VenueRestriction {
  id: string;
  venue_id: string;
  kind: RestrictionKind;
  value: string | null;
  hard: boolean;
}

export interface VenueMedia {
  id: string;
  venue_id: string;
  storage_path: string;
  kind: MediaKind;
  sort_order: number;
  caption: string | null;
  url: string | null;
}

export interface VenueCreate {
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  category?: VenueCategory | null;
  amenities?: string[];
  ideal_for?: string[];
  accepted_event_types?: string[];
  surface_area_sqft?: number | null;
  room_count?: number | null;
  access_note?: string | null;
  view_note?: string | null;
  status?: VenueStatus;
}

export interface VenueUpdate {
  name?: string;
  slug?: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  category?: VenueCategory | null;
  amenities?: string[];
  ideal_for?: string[];
  accepted_event_types?: string[];
  surface_area_sqft?: number | null;
  room_count?: number | null;
  access_note?: string | null;
  view_note?: string | null;
  status?: VenueStatus;
}

export const VENUE_CATEGORY_LABEL: Record<VenueCategory, string> = {
  event_space: "Event space",
  private_property: "Private property",
  commercial_space: "Commercial space",
  boats_yachts: "Boats & yachts",
  member_club: "Member club",
};

export const VENUE_CATEGORIES: VenueCategory[] = [
  "event_space",
  "private_property",
  "commercial_space",
  "boats_yachts",
  "member_club",
];

// Curated starting chips (operators can add custom tags freely too) — a
// venue-agnostic default set covering the amenities that recur across the
// existing demo portfolio (AV, outdoor space, harbour views, accessibility).
export const SUGGESTED_VENUE_AMENITIES: string[] = [
  "AV equipment",
  "Sound system",
  "Dance floor",
  "Outdoor space",
  "Rooftop",
  "Harbour view",
  "Natural light",
  "Private entrance",
  "Catering kitchen",
  "Bridal suite",
  "Parking",
  "Wheelchair accessible",
];

export interface VenueConfigurationCreate {
  name: string;
  capacity: number;
  notes?: string | null;
}

export const RESTRICTION_KINDS: RestrictionKind[] = [
  "no_amplified_music",
  "no_smoking",
  "no_open_flame",
  "min_age",
  "curfew",
  "no_red_wine",
  "other",
];

export interface VenueRestrictionCreate {
  kind: RestrictionKind;
  value?: string | null;
  hard: boolean;
}

export type AvailabilityReason = "booked" | "hold" | "maintenance" | "landlord_blocked" | "other";

export interface VenueAvailability {
  id: string;
  venue_id: string;
  starts_on: string;
  ends_on: string;
  reason: AvailabilityReason;
  hold_expires_at: string | null;
  note: string | null;
}

export interface VenueAvailabilityCreate {
  starts_on: string;
  ends_on: string;
  reason: AvailabilityReason;
  hold_expires_at?: string | null;
  note?: string | null;
}

// `GET /venues/portfolio-availability` and `GET /venues/portfolio` embed
// related rows in one query (16 Jul N+1 batching fix) instead of callers
// looping back with one request per venue.
export interface VenueWithAvailability extends Venue {
  availability: VenueAvailability[];
}

export interface VenueWithPortfolio extends Venue {
  venue_media: VenueMedia[];
  venue_configurations: VenueConfiguration[];
}

export interface VenueActivation {
  id: string;
  venue_id: string;
  client_name: string;
  client_category: string | null;
  event_type: string | null;
  event_date: string | null;
  sort_order: number;
}

export interface VenueActivationCreate {
  client_name: string;
  client_category?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  sort_order?: number;
}

export type FilmStatus = "planned" | "in_production" | "delivered";

export const FILM_STATUS_LABEL: Record<FilmStatus, string> = {
  planned: "Planned",
  in_production: "In production",
  delivered: "Delivered",
};

export interface VenueFilm {
  id: string;
  venue_id: string;
  title: string;
  duration_label: string | null;
  status: FilmStatus;
  video_media_id: string | null;
  video_url: string | null;
  sort_order: number;
}

export interface VenueFilmCreate {
  title: string;
  duration_label?: string | null;
  status?: FilmStatus;
  video_media_id?: string | null;
  sort_order?: number;
}

export interface VenueTeamContact {
  id: string;
  venue_id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  sort_order: number;
}

export interface VenueTeamContactCreate {
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  sort_order?: number;
}

export interface VenueWithProfile extends Venue {
  venue_media: VenueMedia[];
  venue_configurations: VenueConfiguration[];
  venue_activations: VenueActivation[];
  venue_films: VenueFilm[];
  venue_team_contacts: VenueTeamContact[];
}

// Curated starting chips, same spirit as SUGGESTED_VENUE_AMENITIES —
// suggestions only, operators can add anything.
export const SUGGESTED_IDEAL_FOR: string[] = [
  "1-on-1 appointment",
  "Private dinner",
  "Cocktail party",
  "Product launch",
  "Photoshoot",
  "Filming & shooting",
  "Wedding",
  "VIP reception",
];

export const SUGGESTED_ACCEPTED_EVENT_TYPES: string[] = [
  "1-on-1 appointment",
  "Cocktail party",
  "Filming & shooting",
  "Photoshoot",
  "Private function / celebration",
  "Product launch",
  "Sit-down dinner",
  "Staycation",
  "Tradeshow",
];

// --- Enquiry intake (C1) ---------------------------------------------

export type OrganisationKind = "corporate" | "agency" | "brand" | "production_house" | "other";
// Added 18 Jul (task D5) — client-context tier, mirrors the reference
// prototype's "Tier-1 · Maison" badge. Lifetime value / win rate / open-
// proposal count are NOT typed here — computed server-side, not stored.
export type OrganisationTier = "tier-1" | "tier-2" | "standard";
// 'whatsapp' added 18 Jul (task D5) — the standardized brief contract is
// channel-agnostic, so every intake channel needs to be a real value here
// rather than falling back to 'manual' or 'other'.
export type ContactSource = "email" | "web_form" | "concierge" | "manual" | "whatsapp";

export const ORGANISATION_KINDS: OrganisationKind[] = ["brand", "corporate", "agency", "production_house", "other"];

export const ORGANISATION_KIND_LABEL: Record<OrganisationKind, string> = {
  brand: "Brand",
  corporate: "Corporate",
  agency: "Agency",
  production_house: "Production house",
  other: "Other",
};

export const ORGANISATION_TIERS: OrganisationTier[] = ["tier-1", "tier-2", "standard"];

export const ORGANISATION_TIER_LABEL: Record<OrganisationTier, string> = {
  "tier-1": "Tier 1",
  "tier-2": "Tier 2",
  standard: "Standard",
};

export const CONTACT_SOURCE_LABEL: Record<ContactSource, string> = {
  email: "Email",
  web_form: "Web form",
  concierge: "Concierge",
  manual: "Manual",
  whatsapp: "WhatsApp",
};
export type EnquiryChannel = "email" | "web_form" | "manual" | "concierge" | "whatsapp";
// Revamped 18 Jul (task H3) — 5-stage Kanban (Enquiry -> Briefed ->
// Proposed -> Held -> Signed) matching the full Inquiries -> Proposal ->
// Pipeline -> Client workflow, replacing the earlier 8-stage model.
// Mirrors api/app/services/stage_machine.py and
// migrations/versions/0007_enquiry_stage_revamp.py.
export type EnquiryStage = "enquiry" | "briefed" | "proposed" | "held" | "signed" | "lost";

export const ENQUIRY_STAGES: EnquiryStage[] = ["enquiry", "briefed", "proposed", "held", "signed"];

export const STAGE_LABEL: Record<EnquiryStage, string> = {
  enquiry: "Enquiry",
  briefed: "Briefed",
  proposed: "Proposed",
  held: "Held",
  signed: "Signed",
  lost: "Lost",
};

// Status rollup (task H3, added/revised 18 Jul — erd.md §5.1). Reconciles
// the 5-stage Kanban above with the salesperson-facing Open/Awaiting/Won/
// Lost view from the fuller workflow description. Computed server-side
// (`Enquiry.status` in api/app/schemas/enquiry.py) from `stage` — never a
// separate field you set yourself, just mirrored here for the UI's own
// grouping/labels.
export type EnquiryStatus = "open" | "awaiting" | "won" | "lost";

export const STAGE_TO_STATUS: Record<EnquiryStage, EnquiryStatus> = {
  enquiry: "open",
  briefed: "open",
  proposed: "awaiting",
  held: "awaiting",
  signed: "won",
  lost: "lost",
};

export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  open: "Open",
  awaiting: "Awaiting",
  won: "Won",
  lost: "Lost",
};

export const STATUS_COLOR: Record<EnquiryStatus, string> = {
  open: "var(--color-accent)",
  awaiting: "var(--color-warning)",
  won: "var(--color-success)",
  lost: "var(--color-text-muted)",
};

export interface Organisation {
  id: string;
  name: string;
  kind: OrganisationKind;
  // Client-context fields (task D5, 18 Jul) — see Organisation schema
  // docstring, erd.md §5.1: lifetime value/win rate/open-proposal-count
  // are deliberately absent here, computed server-side, not stored.
  tier: OrganisationTier | null;
  rate_card_on_file: boolean;
  rate_card_terms: string | null;
  region: string | null;
  // Contacts-directory fields (19 Jul, migration 0018).
  website: string | null;
  address: string | null;
  notes: string | null;
  // Brand-level contact channel (migration 0019) — distinct from any one
  // contact's own email/phone.
  email: string | null;
  phone: string | null;
  parent_company: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationCreate {
  name: string;
  kind?: OrganisationKind;
  tier?: OrganisationTier | null;
  rate_card_on_file?: boolean;
  rate_card_terms?: string | null;
  region?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
  email?: string | null;
  phone?: string | null;
  parent_company?: string | null;
}

export interface OrganisationUpdate {
  name?: string;
  kind?: OrganisationKind;
  tier?: OrganisationTier | null;
  rate_card_on_file?: boolean;
  rate_card_terms?: string | null;
  region?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
  email?: string | null;
  phone?: string | null;
  parent_company?: string | null;
}

export interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organisation_id: string | null;
  source: ContactSource;
  created_at: string;
}

export interface ContactCreate {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  organisation_id?: string | null;
  source: ContactSource;
}

export interface ContactUpdate {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  organisation_id?: string | null;
}

export interface DealStats {
  enquiry_count: number;
  signed_count: number;
  total_revenue: number;
  currency: string | null;
  last_contact_at: string | null;
  proposal_count: number;
  open_proposal_count: number;
  win_rate: number | null;
}

export interface OrganisationSummary {
  organisation: Organisation;
  contacts: Contact[];
  stats: DealStats;
  auto_imported: boolean;
}

export interface ContactSummary {
  contact: Contact;
  organisation: Organisation | null;
  stats: DealStats;
}

export type TimelineType =
  | "onboarded"
  | "enquiry_received"
  | "brief_parsed"
  | "proposal_sent"
  | "proposal_won"
  | "proposal_declined"
  | "activity";

export type TimelineCategory = "system" | "email" | "proposal" | "event";

export interface TimelineEntry {
  id: string;
  type: TimelineType;
  category: TimelineCategory;
  timestamp: string;
  label: string;
  title: string;
  contact_name: string | null;
  contact_email: string | null;
  body: string | null;
  fields: Record<string, string> | null;
  venues: string[] | null;
  price_low: number | null;
  price_high: number | null;
  currency: string | null;
  enquiry_id: string | null;
  proposal_id: string | null;
}

export interface Enquiry {
  id: string;
  contact_id: string | null;
  channel: EnquiryChannel;
  raw_content: string;
  stage: EnquiryStage;
  // Server-computed rollup of `stage` (added 18 Jul, H3) — always present
  // on API responses; STAGE_TO_STATUS above is only a fallback for any
  // client-only enquiry shape that hasn't round-tripped through the API.
  status: EnquiryStatus;
  assigned_to: string | null;
  created_by: string | null;
  lost_reason: string | null;
  // Team hand-off (task H5). forwarded_to is a team member's name (not an
  // auth user id); forward_note is the optional client-timeline line.
  forwarded_to: string | null;
  forward_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnquiryCreate {
  contact_id?: string | null;
  channel: EnquiryChannel;
  raw_content: string;
  assigned_to?: string | null;
}

// `GET /enquiries` embeds every brief version per enquiry in one query
// (16 Jul N+1 batching fix) instead of one `GET .../briefs` per enquiry.
// Declared here (rather than near Brief below) since it depends on
// Enquiry; pick the highest `version` yourself, embedded order isn't
// guaranteed.
export interface EnquiryWithBriefs extends Enquiry {
  briefs: Brief[];
}

// --- AI Brief Parser (D1, standardized 18 Jul — D5) ---------------------
// One brief contract regardless of channel (email/WhatsApp/manual free
// text via the AI parser, or the public web form filling these directly
// and deterministically). Mirrors api/app/schemas/brief.py +
// migrations/versions/0008_brief_standardization.py. See erd.md §5.1.

export type BudgetBasis = "total" | "per_head";
export type BudgetStatus = "confirmed" | "tbc" | "unspecified";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "full_day";
export type ReviewStatus = "auto_accepted" | "needs_review" | "human_approved" | "human_corrected";

// Conventional (not schema-enforced) keys inside `requirements` — see
// app/schemas/brief.py's REQUIREMENTS_CONVENTIONAL_KEYS. Not exhaustive;
// any other free-form key is still valid.
export interface BriefRequirements {
  format_needs?: string[];
  tech_needs?: string[];
  mood?: string[];
  attachments?: { name: string; url: string }[];
  [key: string]: unknown;
}

export interface Brief {
  id: string;
  enquiry_id: string;
  version: number;
  date_window_start: string | null;
  date_window_end: string | null;
  date_suggestions: string[];
  event_date_flexible: boolean;
  guest_count: number | null;
  event_type: string | null;
  duration_hours: number | null;
  time_of_day: TimeOfDay | null;
  budget_amount: number | null;
  budget_basis: BudgetBasis | null;
  budget_status: BudgetStatus;
  budget_estimate_low: number | null;
  budget_estimate_high: number | null;
  location_preference: string | null;
  catering: string | null;
  decision_by: string | null;
  requirements: BriefRequirements;
  confidence: number;
  flagged_fields: string[];
  fields_to_confirm: string[];
  review_status: ReviewStatus;
  reviewed_by: string | null;
  parser_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefUpdate {
  date_window_start?: string | null;
  date_window_end?: string | null;
  date_suggestions?: string[];
  event_date_flexible?: boolean;
  guest_count?: number | null;
  event_type?: string | null;
  duration_hours?: number | null;
  time_of_day?: TimeOfDay | null;
  budget_amount?: number | null;
  budget_basis?: BudgetBasis | null;
  budget_status?: BudgetStatus;
  budget_estimate_low?: number | null;
  budget_estimate_high?: number | null;
  location_preference?: string | null;
  catering?: string | null;
  decision_by?: string | null;
  requirements?: BriefRequirements;
  flagged_fields?: string[];
  fields_to_confirm?: string[];
  review_status?: ReviewStatus;
}

// --- Recommendation engine (E1/E2) ------------------------------------

export interface ShortlistEntry {
  venue_id: string;
  venue_name: string;
  configuration_id: string;
  configuration_name: string;
  capacity: number;
  estimated_total: number | null;
  within_budget: boolean | null;
  sort_order: number;
  pricing_rules_id: string | null;
  quote_breakdown: Record<string, unknown> | null;
}

export interface ExclusionReason {
  venue_id: string;
  venue_name: string;
  reason: string;
}

export interface ShortlistResponse {
  shortlist: ShortlistEntry[];
  excluded: ExclusionReason[];
}

// Curate step (E3): every active venue as a selectable, priced option — fit
// is advisory (`fits` + `fit_reasons`), not a gate. Fitting venues sort
// first; `recommended` is the AI's description-based pick.
export interface VenueOption {
  venue_id: string;
  venue_name: string;
  configuration_id: string;
  configuration_name: string;
  capacity: number;
  fits: boolean;
  fit_reasons: string[];
  estimated_total: number | null;
  within_budget: boolean | null;
  pricing_rules_id: string | null;
  quote_breakdown: Record<string, unknown> | null;
  recommended: boolean;
  sort_order: number;
}

// --- Pricing rules (F1/F2) ---------------------------------------------

export interface PricingRule {
  id: string;
  venue_id: string;
  currency: string;
  base_rate: number;
  per_head_tiers: { min_guests: number; max_guests: number | null; rate_per_head: number }[];
  duration_multipliers: { included_hours?: number; overtime_rate_per_hour?: number };
  day_adjustments: Record<string, number>;
  season_adjustments: { start_date: string; end_date: string; multiplier: number }[];
  min_spend: number | null;
  notes: string | null;
  effective_from: string;
  effective_to: string | null;
}

export interface PricingRuleCreate {
  currency?: string;
  base_rate: number;
  per_head_tiers?: { min_guests: number; max_guests: number | null; rate_per_head: number }[];
  duration_multipliers?: { included_hours?: number; overtime_rate_per_hour?: number };
  day_adjustments?: Record<string, number>;
  season_adjustments?: { start_date: string; end_date: string; multiplier: number }[];
  min_spend?: number | null;
  notes?: string | null;
  effective_from: string;
  effective_to?: string | null;
}

export type AddonPricingType = "flat" | "per_head" | "per_hour";

export interface PricingRuleAddon {
  id: string;
  pricing_rules_id: string;
  name: string;
  pricing_type: AddonPricingType;
  amount: number;
}

export interface PricingRuleAddonCreate {
  name: string;
  pricing_type: AddonPricingType;
  amount: number;
}

export interface QuoteBreakdown {
  currency: string;
  base_rate: number;
  per_head_total: number;
  day_adjustment_multiplier: number;
  season_adjustment_multiplier: number;
  pre_adjustment_subtotal: number;
  adjusted_subtotal: number;
  duration_overtime_amount: number;
  addons_total: number;
  addons: { id: string; name: string; pricing_type: AddonPricingType; amount: number }[];
  subtotal: number;
  min_spend_applied: boolean;
  total: number;
  pricing_rules_id: string;
}

// --- Proposals (G1) -----------------------------------------------------

export type ProposalStatus = "draft" | "pending_approval" | "sent" | "viewed" | "accepted" | "declined";
export type ProposalOrigin = "staff" | "concierge";

export interface Proposal {
  id: string;
  enquiry_id: string;
  brief_id: string;
  version: number;
  status: ProposalStatus;
  title: string;
  intro_copy: string | null;
  legal_boilerplate: string | null;
  currency: string;
  origin: ProposalOrigin;
  // Added 18 Jul (task D5). event_date is the *locked* date decided in
  // the generate-and-share step — distinct from the brief's
  // date_window_start/end, which may still span a range. personal_email_
  // copy is the AI-drafted note that accompanies a sent proposal, a
  // separate artifact from intro_copy.
  event_date: string | null;
  personal_email_copy: string | null;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ProposalCreate {
  enquiry_id: string;
  brief_id: string;
  title: string;
  intro_copy?: string | null;
  legal_boilerplate?: string | null;
  currency?: string;
  origin?: ProposalOrigin;
  event_date?: string | null;
  personal_email_copy?: string | null;
}

export interface ProposalVenue {
  id: string;
  proposal_id: string;
  venue_id: string;
  configuration_id: string;
  pricing_rules_id: string;
  quote_breakdown: Record<string, unknown>;
  quote_total: number;
  venue_copy: string | null;
  sort_order: number;
  recommended: boolean;
}

export interface ProposalVenueCreate {
  venue_id: string;
  configuration_id: string;
  pricing_rules_id: string;
  quote_breakdown: Record<string, unknown>;
  quote_total: number;
  venue_copy?: string | null;
  sort_order?: number;
  recommended?: boolean;
}

export interface ProposalLinkToken {
  id: string;
  proposal_id: string;
  token: string;
  expires_at: string;
  revoked: boolean;
}

// Public (unauthenticated) proposal view — the narrowed shape returned by
// GET /public/proposals/{token} for the shareable client-facing page.
export interface PublicProposalVenue {
  venue_id: string;
  venue_name: string;
  configuration_name: string;
  quote_total: number;
  venue_copy: string | null;
  sort_order: number;
  recommended: boolean;
}

export interface PublicProposal {
  title: string;
  intro_copy: string | null;
  legal_boilerplate: string | null;
  currency: string;
  status: string;
  venues: PublicProposalVenue[];
}
