import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';

import { describe, expect, it } from 'vitest';

import { findRestaurants } from '../foursquare';

const METERS_PER_MILE = 1609.34;
const SEARCH_RADIUS = Math.round(2 * METERS_PER_MILE);
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY';

async function livePlacesSearch(
  url: string,
): Promise<{ body: string; headers: IncomingHttpHeaders; statusCode?: number }> {
  return await new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: false,
        headers: {
          Authorization: FOURSQUARE_API_KEY,
          Accept: 'application/json',
          'X-Places-Api-Version': '1970-01-01',
          'User-Agent': 'lunch-roulette-test/1.0',
          Connection: 'close',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ body, headers: res.headers, statusCode: res.statusCode });
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
  });
}

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

  it('returns a next-page link for dense search results', async () => {
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('query', 'restaurants');
    url.searchParams.set('ll', '41.8781,-87.6298');
    url.searchParams.set('radius', '5000');
    url.searchParams.set('categories', '13065');
    url.searchParams.set('limit', '50');
    url.searchParams.set('fields', 'fsq_id,name');

    const { body, headers, statusCode } = await livePlacesSearch(url.toString());

    expect(statusCode).toBe(200);
    expect(headers.link).toContain('rel="next"');
    expect(body).toContain('"results"');
  }, 15_000);
});
