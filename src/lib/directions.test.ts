import { describe, expect, it } from 'vitest';
import { directionsLinks } from './directions';

describe('directionsLinks', () => {
  it('builds the address form with encoded commas and spaces', () => {
    const l = directionsLinks({ address: 'Herzl 5', city: 'Haifa' });
    expect(l?.google).toBe('https://www.google.com/maps/search/?api=1&query=Herzl%205%2C%20Haifa');
    expect(l?.waze).toBe('https://waze.com/ul?q=Herzl%205%2C%20Haifa&navigate=yes');
  });
  it('encodes non-latin addresses', () => {
    const l = directionsLinks({ address: 'Герцль 5', city: 'Хайфа' });
    expect(l?.google).toContain(encodeURIComponent('Герцль 5, Хайфа'));
  });
  it('uses the address alone when the city is missing', () => {
    expect(directionsLinks({ address: 'Herzl 5', city: null })?.waze).toBe('https://waze.com/ul?q=Herzl%205&navigate=yes');
  });
  it('returns null without an address', () => {
    expect(directionsLinks({ address: null, city: 'Haifa' })).toBeNull();
    expect(directionsLinks({ address: '  ', city: 'Haifa' })).toBeNull();
    expect(directionsLinks(undefined)).toBeNull();
  });
  it('prefers coordinates when present', () => {
    const l = directionsLinks({ address: 'Herzl 5', city: 'Haifa', geo_lat: 32.79, geo_lng: 34.99 });
    expect(l?.google).toBe('https://www.google.com/maps/search/?api=1&query=32.79%2C34.99');
    expect(l?.waze).toBe('https://waze.com/ul?ll=32.79%2C34.99&navigate=yes');
  });
  it('works with coordinates and no address', () => {
    expect(directionsLinks({ geo_lat: 1, geo_lng: 2 })).not.toBeNull();
  });
});
