import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findRestaurants, getRestaurant } from '../foursquare';

vi.mock('axios', () => {
  const mockGet = vi.fn();
  return {
    default: {
      create: () => ({ get: mockGet }),
    },
    __mockGet: mockGet,
  };
});

const { __mockGet: mockGet } = await import('axios') as unknown as { __mockGet: ReturnType<typeof vi.fn> };

function makePlace(overrides: Record<string, unknown> = {}) {
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

const geocodeSearchResponse = {
  results: [{ fsq_id: 'probe' }],
  context: { geo_bounds: { circle: { center: { latitude: 40.7128, longitude: -74.006 } } } },
};

beforeEach(() => {
  mockGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getCallParams(callIndex: number): Record<string, unknown> {
  return (mockGet.mock.calls[callIndex][1] as { params: Record<string, unknown> }).params;
}

describe('findRestaurants', () => {
  it('geocodes via near probe then searches with ll + radius', async () => {
    const place = makePlace();
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    await findRestaurants('New York, NY', 1000, '$$');

    // First call: geocode probe with near
    const probeParams = getCallParams(0);
    expect(probeParams.near).toBeDefined();
    expect(probeParams.limit).toBe(1);

    // Second call: search with ll + radius
    const searchParams = getCallParams(1);
    expect(searchParams.ll).toContain('40.7128');
    expect(searchParams.radius).toBe(1000);
  });

  it('maps Foursquare fields to Restaurant interface', async () => {
    const place = makePlace();
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

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
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.rating).toBe(5);
  });

  it('defaults rating to 0 when missing', async () => {
    const place = makePlace({ rating: undefined });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.rating).toBe(0);
  });

  it('converts price number to dollar signs', async () => {
    const place = makePlace({ price: 3 });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.price).toBe('$$$');
  });

  it('defaults price to empty string when missing', async () => {
    const place = makePlace({ price: undefined });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.price).toBe('');
  });

  it('builds image URL from photo prefix + "original" + suffix', async () => {
    const place = makePlace({
      photos: [{ prefix: 'https://fastly.4sqi.net/img/general/', suffix: '/12345_abcde.jpg' }],
    });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.image_url).toBe('https://fastly.4sqi.net/img/general/original/12345_abcde.jpg');
  });

  it('defaults image_url to empty string when no photos', async () => {
    const place = makePlace({ photos: [] });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.image_url).toBe('');
  });

  it('maps category names to title field', async () => {
    const place = makePlace({ categories: [{ name: 'Sushi' }, { name: 'Japanese' }] });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.categories).toEqual([{ title: 'Sushi' }, { title: 'Japanese' }]);
  });

  it('maps menu string to attributes.menu_url', async () => {
    const place = makePlace({ menu: 'https://menu.example.com' });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.attributes).toEqual({ menu_url: 'https://menu.example.com' });
  });

  it('omits attributes when no menu present', async () => {
    const place = makePlace({ menu: undefined });
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [place] } });

    const [restaurant] = await findRestaurants('NYC', 1000, '$$$$');
    expect(restaurant.attributes).toBeUndefined();
  });

  it('passes max_price to API', async () => {
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [] } });

    await findRestaurants('NYC', 1000, '$$');

    const searchParams = getCallParams(1);
    expect(searchParams.max_price).toBe(2);
  });

  it('stops paginating when page has fewer results than limit', async () => {
    const partialPage = Array.from({ length: 10 }, (_, i) => makePlace({ fsq_id: `r-${i.toString()}` }));
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: partialPage } });

    const results = await findRestaurants('NYC', 1000, '$$$$');
    expect(results).toHaveLength(10);
    // 2 calls: geocode probe + one search page
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('passes correct search params', async () => {
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockResolvedValueOnce({ data: { results: [] } });

    await findRestaurants('NYC', 1500, '$$');

    const searchParams = getCallParams(1);
    expect(searchParams.query).toBe('restaurants');
    expect(searchParams.ll).toContain('40.7128');
    expect(searchParams.radius).toBe(1500);
    expect(searchParams.categories).toBe('13065');
    expect(searchParams.limit).toBe(50);
    expect(searchParams.fields).toContain('fsq_id');
  });

  it('throws on geocode probe failure', async () => {
    mockGet.mockResolvedValueOnce({ data: { context: {} } });

    await expect(findRestaurants('NYC', 1000, '$$')).rejects.toThrow('Could not geocode address');
  });

  it('throws on search failure', async () => {
    mockGet
      .mockResolvedValueOnce({ data: geocodeSearchResponse })
      .mockRejectedValueOnce(new Error('Request failed'));

    await expect(findRestaurants('NYC', 1000, '$$')).rejects.toThrow('Request failed');
  });
});

describe('getRestaurant', () => {
  it('fetches a single place by ID and maps it', async () => {
    const place = makePlace({ fsq_id: 'xyz789' });
    mockGet.mockResolvedValueOnce({ data: { results: [place] } });

    const restaurant = await getRestaurant('xyz789');

    expect(restaurant.id).toBe('xyz789');
    expect(restaurant.name).toBe('Test Restaurant');
  });

  it('throws on fetch failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Request failed'));

    await expect(getRestaurant('bad-id')).rejects.toThrow('Request failed');
  });

  it('throws when no results found', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: [] } });

    await expect(getRestaurant('missing-id')).rejects.toThrow('Restaurant not found');
  });
});
