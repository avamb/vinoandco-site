/**
 * Types of the Arena platform public feed (`GET /v1/public/feeds/{token}/events[/{id}]`).
 *
 * Mirrors the platform's `hfeed` response shapes (spec 62 §6.0). Fields marked
 * "pending П-x" are not in the feed yet; they are optional so the site keeps
 * building until the platform adds them.
 *
 * This folder is the boundary for a future shared library: no site markup, no
 * Vino&Co specifics.
 */

export type SalesState = 'open' | 'soon' | 'sold_out' | 'ended' | 'cancelled' | '';
export type Visibility = 'public' | 'unlisted' | string;

export interface FeedEvent {
  id: string;
  display_number: number;
  org_id: string;
  name: string;
  /** Raw organizer text (ART format). Do not render; use `description_html`. */
  description: string | null;
  /** Safe HTML produced by the platform from ART (spec 44). */
  description_html: string | null;
  /** Plain text for meta description and JSON-LD. */
  description_text: string | null;
  status: string;
  first_session_at: string | null;
  last_session_at: string | null;
  venue_names: string[];
  visibility: Visibility;
  image_url: string | null;
  poster_media_id: string | null;
  /** Signed URL, valid ~24 h: download at build time, never link to it. */
  poster_url: string | null;
  created_at: string;
  updated_at: string;
  /** pending П-5 */
  slug?: string | null;
  /** pending П-5, e.g. "18+" */
  age_rating?: string | null;
  /** pending П-5 */
  short_description?: string | null;
}

export interface FeedPriceStep {
  remaining_at_price: number | null;
  next_price: number;
  /** pending П-4 */
  next_tier_id?: string | null;
}

export interface FeedTier {
  id: string;
  name: string;
  pricing_mode: 'fixed' | 'free' | 'pwyw' | string;
  /** Minor units (agorot). */
  price_amount: number;
  currency: string;
  pwyw_min: number | null;
  pwyw_max: number | null;
  capacity: number | null;
  sale_window_start: string | null;
  sale_window_end: string | null;
  sort_order: number;
  current_price: number;
  next_price_change_at: string | null;
  next_price?: number;
  price_step?: FeedPriceStep;
  is_open: boolean;
  available: number | null;
  is_addon?: boolean;
}

export interface FeedBuyerField {
  key: string;
  required: boolean;
  enabled: boolean;
}

export interface FeedMediaItem {
  kind: 'poster' | 'video';
  poster_url: string | null;
  video_url: string | null;
  position: number;
}

export interface FeedMarketingOptIn {
  enabled: boolean;
  org_name?: string;
  text_version?: string;
  /** Reward for the tick: percent (1-100) or a fixed amount in minor units of `currency`. */
  discount?: { type: 'percent' | 'fixed' | string; value: number; currency?: string | null };
}

export interface FeedSession {
  id: string;
  start_at: string;
  end_at: string;
  sales_end_at: string;
  doors_open_at: string | null;
  capacity_total: number;
  status: string;
  admission_mode?: string;
  schema_url?: string;
  seat_status_url?: string;
  buyer_fields: FeedBuyerField[];
  service_fee_percent: string;
  promo_codes_available?: boolean;
  show_withdrawal_notice?: boolean;
  white_label?: boolean;
  consent?: Record<string, unknown>;
  marketing_optin?: FeedMarketingOptIn;
  cart_reminder?: boolean;
  /** IANA zone of the venue; '' when unknown. */
  timezone: string;
  sales_state: SalesState;
  tiers: FeedTier[];
  poster_media_id: string | null;
  poster_url: string | null;
  media_gallery?: FeedMediaItem[];
}

export interface FeedMaterialPhoto {
  media_id: string;
  url: string;
  caption: string | null;
  width: number | null;
  height: number | null;
}

export interface FeedMaterials {
  gallery: FeedMaterialPhoto[];
  videos: { provider: string; video_id: string | null; embed_url: string | null; url: string }[];
  partner_links: { url: string; seller_name: string }[];
  map_point: { latitude: number; longitude: number; label: string | null } | null;
  report_photos: FeedMaterialPhoto[];
}

export interface FeedVenue {
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  timezone: string | null;
  /** start_at of the sessions held at this venue. */
  session_starts: string[];
}

export interface FeedEventDetail extends FeedEvent {
  sessions: FeedSession[];
  materials: FeedMaterials;
  venues: FeedVenue[];
}

export interface FeedPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface FeedEventList {
  events: FeedEvent[];
  pagination: FeedPagination;
}

/**
 * The snapshot the builder writes and the site builds from: every event of the
 * channel with its detail, fetched in one complete pass (spec 62 §9).
 */
export interface EventsSnapshot {
  /** RFC 3339 time the snapshot was taken. */
  fetched_at: string;
  source: 'feed' | 'sample';
  events: FeedEventDetail[];
}

/** Platform error envelope. */
export interface ApiError {
  error: { code: string; message: string; request_id?: string };
}

// ── Public checkout (spec 62 §5.1, §5.4, §5.5) ─────────────────────────────

export interface GaItem {
  tier_id: string;
  quantity: number;
}

export interface BuyerInfo {
  email: string;
  name?: string;
  phone?: string;
}

/** Sales link and utm labels that brought the buyer (spec 43 §4.4). */
export interface Attribution {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** RFC 3339 time of the landing. */
  landed_at?: string;
  /** First touch of the visit (ref, utm_source, utm_campaign, landed_at). */
  first?: Pick<Attribution, 'ref' | 'utm_source' | 'utm_campaign' | 'landed_at'>;
}

export interface MarketingConsentInput {
  accepted: boolean;
  /** `marketing_optin.text_version` of the session; another version is 422 marketing.consent_outdated. */
  text_version: string;
  discount?: boolean;
}

/** Cookie-banner choice passed along with the order (spec 62 §8.1). Pending on the platform. */
export interface TrackingConsentInput {
  granted: boolean;
  version: string;
  at: string;
}

export interface CheckoutQuoteRequest {
  session_id: string;
  ga_items?: GaItem[];
  seats?: string[];
  promo_code?: string | null;
  marketing_consent?: MarketingConsentInput;
}

export interface PricingLine {
  tier_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** Amounts in minor units. */
export interface PricingBreakdown {
  unit_price: number;
  quantity: number;
  subtotal: number;
  discount: number;
  platform_fee: number;
  provider_fee: number;
  tax: number;
  total: number;
  currency: string;
  lines?: PricingLine[];
}

export interface CheckoutQuoteResponse {
  pricing: PricingBreakdown;
  promo_applied: boolean;
  marketing_discount_applied: boolean;
}

export interface CheckoutStartRequest {
  session_id: string;
  ga_items?: GaItem[];
  seats?: string[];
  buyer: BuyerInfo;
  promo_code?: string | null;
  return_url: string;
  locale: string;
  attribution?: Attribution;
  marketing_consent?: MarketingConsentInput;
  /** pending П-20 / §8.1 */
  tracking_consent?: TrackingConsentInput;
  /** The total the buyer saw (minor units); pending §5.4 p.3 (409 checkout.price_changed). */
  expected_total?: number;
}

export interface CheckoutStartResponse {
  checkout_token: string;
  /** Payment page (AllPay); for a free order the return page itself. */
  redirect_url: string;
  expires_at: string;
  pricing: PricingBreakdown;
  marketing_discount_applied?: boolean;
}

export type CheckoutPublicStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded' | 'manual_review' | string;

export interface CheckoutStatusTicket {
  ticket_id: string;
  sector?: string | null;
  row?: string | null;
  number?: string | null;
  human_code?: string | null;
  /** Platform-relative path; prefix the API origin. */
  pdf_url?: string | null;
}

export interface CheckoutStatusItem {
  type: 'seat' | 'general_admission' | string;
  tier_id?: string | null;
  tier_name?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
}

export interface CheckoutStatus {
  status: CheckoutPublicStatus;
  checkout_token: string;
  checkout_session_id: string;
  order_number?: number | null;
  expires_at?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  currency?: string | null;
  payment_url?: string | null;
  items: CheckoutStatusItem[];
  tickets: CheckoutStatusTicket[];
}

export interface CheckoutRecoverResponse {
  checkout_token: string;
  expires_at: string;
  pricing?: PricingBreakdown;
}

export interface ReferralOffer {
  code: string;
  friend_discount_pct: number;
  cashback_pct: number;
  share_url: string | null;
}

/** POST /v1/public/funnel (spec 50). `external_site` is pending П-21. */
export interface FunnelBeacon {
  feed_token: string;
  event_id: string;
  session_id?: string;
  step: 'view' | 'session_open' | 'seats_chosen';
  surface: 'external_site' | 'widget' | 'hosted_page' | 'tickets_page';
  utm_source?: string;
  utm_campaign?: string;
}
