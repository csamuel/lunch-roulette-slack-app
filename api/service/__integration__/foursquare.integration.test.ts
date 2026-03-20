import { describe, expect, it } from 'vitest';

import { findRestaurants } from '../foursquare';

const METERS_PER_MILE = 1609.34;
const SEARCH_RADIUS = Math.round(2 * METERS_PER_MILE);

describe('Foursquare API integration', () => {
  it('finds restaurants near zip code 78704 within a 2 mile radius', async () => {
    const restaurants = await findRestaurants('78704', SEARCH_RADIUS, '$$$$');

    // Should return results
    expect(restaurants.length).toBeGreaterThan(0);

    // Verify every result has the required Restaurant shape
    for (const r of restaurants) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.url).toBeTruthy();
      expect(typeof r.distance).toBe('number');
      expect(typeof r.rating).toBe('number');
      expect(r.rating).toBeGreaterThanOrEqual(0);
      expect(r.rating).toBeLessThanOrEqual(5);
      expect(r.location.display_address).toBeInstanceOf(Array);
      expect(r.location.display_address.length).toBeGreaterThan(0);
      expect(r.categories.length).toBeGreaterThan(0);
      expect(r.categories[0]).toHaveProperty('title');
    }
  }, 15_000);
});
