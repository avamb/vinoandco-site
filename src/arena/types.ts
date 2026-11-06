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
  discount?: { type: string; [k: string]: unknown };
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
