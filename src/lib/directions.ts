/**
 * "How to get there" links: build the Google Maps and Waze addresses for a venue.
 * Browser-safe, no Node imports. The feed has no coordinates yet, so the address
 * form is used; `geo_lat` / `geo_lng` are preferred as soon as the feed sends them.
 */
export interface DirectionsVenue {
  address?: string | null;
  city?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export interface DirectionsLinks {
  google: string;
  waze: string;
}

function coordinate(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Links for a venue, or null when neither coordinates nor an address are known. */
export function directionsLinks(venue: DirectionsVenue | null | undefined): DirectionsLinks | null {
  if (!venue) return null;
  const lat = coordinate(venue.geo_lat);
  const lng = coordinate(venue.geo_lng);
  if (lat !== null && lng !== null) {
    const ll = `${lat},${lng}`;
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll)}`,
      waze: `https://waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`,
    };
  }
  const address = (venue.address ?? '').trim();
  if (!address) return null;
  const city = (venue.city ?? '').trim();
  const q = encodeURIComponent(city ? `${address}, ${city}` : address);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}
