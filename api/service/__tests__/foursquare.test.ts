import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoursquarePlace } from '../../types/restaurant';

import { findRestaurants, getRestaurant } from '../foursquare';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makePlace(overrides: Partial<FoursquarePlace> = {}): FoursquarePlace {
  return {
    fsq_id: 'abc123',
    name: 'Test Restaurant',
    link: 'https://foursquare.com/v/abc123',
    photos: [{ prefix: 'https://img.com/', suffix: '/photo.jpg' }],
    distance: 500,
    price: 2,
    rating: 8.4,
    location: { formatted_address: '123 Main St, Springfield' },
    categories: [{ name: 'Italian' }, { name: 'Pizza' }],
    menu: 'https://example.com/menu',
    ...overrides,
  };
}

function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => await Promise.resolve(body),
  } as Response;
}

const geocodeSearchResponse = {
  results: [{ fsq_id: 'probe' }],
  context: { geo_bounds: { circle: { center: { latitude: 40.7128, longitude: -74.006 } } } },
};

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('findRestaurants', () => {
  it('geocodes via near probe then searches with ll + radius', async () => {
    const place = makePlace();
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    await findRestaurants('New York, NY', 1000, '$$');

    // First call: geocode probe with near
    const probeUrl = mockFetch.mock.calls[0][0] as string;
    expect(probeUrl).toContain('near=New+York');
    expect(probeUrl).toContain('limit=1');

    // Second call: search with ll + radius
    const searchUrl = mockFetch.mock.calls[1][0] as string;
    expect(searchUrl).toContain('ll=40.7128');
    expect(searchUrl).toContain('-74.006');
    expect(searchUrl).toContain('radius=1000');
  });

  it('maps Foursquare fields to Restaurant interface', async () => {
    const place = makePlace();
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');

    expect(restaurant).toEqual({
      id: 'abc123',
      name: 'Test Restaurant',
      url: 'https://foursquare.com/v/abc123',
      image_url: 'https://img.com/original/photo.jpg',
      distance: 500,
      price: '$$',
      rating: 4.2,
      display_address: ['123 Main St, Springfield'],
      location: { display_address: ['123 Main St, Springfield'] },
      categories: [{ title: 'Italian' }, { title: 'Pizza' }],
      attributes: { menu_url: 'https://example.com/menu' },
    });
  });

  it('normalizes rating from 0-10 to 0-5 scale', async () => {
    const place = makePlace({ rating: 10 });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.rating).toBe(5);
  });

  it('defaults rating to 0 when missing', async () => {
    const place = makePlace({ rating: undefined });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.rating).toBe(0);
  });

  it('converts price number to dollar signs', async () => {
    const place = makePlace({ price: 3 });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.price).toBe('$$$');
  });

  it('defaults price to empty string when missing', async () => {
    const place = makePlace({ price: undefined });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.price).toBe('');
  });

  it('builds image URL from photo prefix + "original" + suffix', async () => {
    const place = makePlace({
      photos: [{ prefix: 'https://fastly.4sqi.net/img/general/', suffix: '/12345_abcde.jpg' }],
    });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.image_url).toBe('https://fastly.4sqi.net/img/general/original/12345_abcde.jpg');
  });

  it('defaults image_url to empty string when no photos', async () => {
    const place = makePlace({ photos: [] });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.image_url).toBe('');
  });

  it('maps category names to title field', async () => {
    const place = makePlace({ categories: [{ name: 'Sushi' }, { name: 'Japanese' }] });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.categories).toEqual([{ title: 'Sushi' }, { title: 'Japanese' }]);
  });

  it('maps menu string to attributes.menu_url', async () => {
    const place = makePlace({ menu: 'https://menu.example.com' });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.attributes).toEqual({ menu_url: 'https://menu.example.com' });
  });

  it('omits attributes when no menu present', async () => {
    const place = makePlace({ menu: undefined });
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [place] }));

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.attributes).toBeUndefined();
  });

  it('passes max_price to API', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [] }));

    await findRestaurants('NYC', 1000, '$$');

    const searchUrl = new URL(mockFetch.mock.calls[1][0] as string);
    expect(searchUrl.searchParams.get('max_price')).toBe('2');
  });

  it('paginates with cursor until no more results', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makePlace({ fsq_id: `p1-${i.toString()}` }));
    const page2 = [makePlace({ fsq_id: 'p2-0' })];

    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: page1, context: { next_cursor: 'cursor123' } }))
      .mockResolvedValueOnce(mockResponse({ results: page2 }));

    const results = await findRestaurants('NYC', 1000, '$$$$');
    expect(results).toHaveLength(51);

    // Verify cursor was passed in third fetch (after geocode probe + first search page)
    const thirdUrl = mockFetch.mock.calls[2][0] as string;
    expect(thirdUrl).toContain('cursor=cursor123');
  });

  it('stops paginating when page has fewer results than limit', async () => {
    const partialPage = Array.from({ length: 10 }, (_, i) => makePlace({ fsq_id: `r-${i.toString()}` }));
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: partialPage, context: { next_cursor: 'more' } }));

    const results = await findRestaurants('NYC', 1000, '$$$$');
    expect(results).toHaveLength(10);
    // 2 fetch calls: geocode probe + one search page
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sends correct headers with API key', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [] }));

    await findRestaurants('NYC', 1000, '$$');

    for (const call of mockFetch.mock.calls) {
      const options = call[1] as RequestInit;
      const fetchHeaders = options.headers as Record<string, string>;
      expect(fetchHeaders.Authorization).toBe('YOUR_FOURSQUARE_API_KEY');
      expect(fetchHeaders.Accept).toBe('application/json');
    }
  });

  it('passes correct search params', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse({ results: [] }));

    await findRestaurants('NYC', 1500, '$$');

    const searchUrl = new URL(mockFetch.mock.calls[1][0] as string);
    expect(searchUrl.searchParams.get('query')).toBe('restaurants');
    expect(searchUrl.searchParams.get('ll')).toContain('40.7128');
    expect(searchUrl.searchParams.get('radius')).toBe('1500');
    expect(searchUrl.searchParams.get('categories')).toBe('13065');
    expect(searchUrl.searchParams.get('limit')).toBe('50');
    expect(searchUrl.searchParams.get('fields')).toContain('fsq_id');
  });

  it('throws on geocode probe failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(null, false, 401));

    await expect(findRestaurants('NYC', 1000, '$$')).rejects.toThrow('Foursquare geocode failed');
  });

  it('throws on search failure', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(geocodeSearchResponse))
      .mockResolvedValueOnce(mockResponse(null, false, 500));

    await expect(findRestaurants('NYC', 1000, '$$')).rejects.toThrow('Foursquare search failed');
  });
});

describe('getRestaurant', () => {
  it('fetches a single place by ID and maps it', async () => {
    const place = makePlace({ fsq_id: 'xyz789' });
    mockFetch.mockResolvedValueOnce(mockResponse(place));

    const restaurant = await getRestaurant('xyz789');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/places/xyz789');

    expect(restaurant.id).toBe('xyz789');
    expect(restaurant.name).toBe('Test Restaurant');
  });

  it('throws on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(null, false, 404));

    await expect(getRestaurant('bad-id')).rejects.toThrow('Foursquare place lookup failed');
  });
});
