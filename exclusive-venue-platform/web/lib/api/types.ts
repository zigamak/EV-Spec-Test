export type VenueStatus = "draft" | "pending_approval" | "active" | "inactive";
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
  status?: VenueStatus;
}

export interface VenueUpdate {
  name?: string;
  slug?: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  status?: VenueStatus;
}

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

// --- Enquiry intake (C1) ---------------------------------------------

export type OrganisationKind = "corporate" | "agency" | "brand" | "production_house" | "other";
export type ContactSource = "email" | "web_form" | "concierge" | "manual";
export type EnquiryChannel = "email" | "web_form" | "manual" | "concierge";
export type EnquiryStage =
  | "new"
  | "qualified"
  | "proposal_sent"
  | "follow_up"
  | "visit"
  | "negotiation"
  | "confirmed"
  | "lost";

export const ENQUIRY_STAGES: EnquiryStage[] = [
  "new",
  "qualified",
  "proposal_sent",
  "follow_up",
  "visit",
  "negotiation",
  "confirmed",
];

export const STAGE_LABEL: Record<EnquiryStage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  follow_up: "Follow up",
  visit: "Visit",
  negotiation: "Negotiation",
  confirmed: "Confirmed",
  lost: "Lost",
};

export interface Organisation {
  id: string;
  name: string;
  kind: OrganisationKind;
}

export interface OrganisationCreate {
  name: string;
  kind?: OrganisationKind;
}

export interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  organisation_id: string | null;
  source: ContactSource;
  created_at: string;
}

export interface ContactCreate {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  organisation_id?: string | null;
  source: ContactSource;
}

export interface Enquiry {
  id: string;
  contact_id: string | null;
  channel: EnquiryChannel;
  raw_content: string;
  stage: EnquiryStage;
  assigned_to: string | null;
  created_by: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnquiryCreate {
  contact_id?: string | null;
  channel: EnquiryChannel;
  raw_content: string;
  assigned_to?: string | null;
}

// --- AI Brief Parser (D1) ---------------------------------------------

export type BudgetBasis = "total" | "per_head";
export type ReviewStatus = "auto_accepted" | "needs_review" | "human_approved" | "human_corrected";

export interface Brief {
  id: string;
  enquiry_id: string;
  version: number;
  event_date: string | null;
  event_date_flexible: boolean;
  guest_count: number | null;
  event_type: string | null;
  budget_amount: number | null;
  budget_basis: BudgetBasis | null;
  duration_hours: number | null;
  location_preference: string | null;
  requirements: Record<string, unknown>;
  confidence: number;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  parser_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefUpdate {
  event_date?: string | null;
  event_date_flexible?: boolean;
  guest_count?: number | null;
  event_type?: string | null;
  budget_amount?: number | null;
  budget_basis?: BudgetBasis | null;
  duration_hours?: number | null;
  location_preference?: string | null;
  requirements?: Record<string, unknown>;
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
  status: ProposalStatus;
  title: string;
  intro_copy: string | null;
  legal_boilerplate: string | null;
  currency: string;
  origin: ProposalOrigin;
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
