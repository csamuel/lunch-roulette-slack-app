import createClient from 'openapi-fetch';

import type { paths } from '../types/foursquare-api';
import type { Restaurant } from '../types/restaurant';

type Place = NonNullable<
  NonNullable<paths['/v3/places/search']['get']['responses']['200']['content']['application/json']['results']>[number]
>;

const PAGE_LIMIT = 50;
const MAX_RESULTS = 200;
const FIELDS = 'fsq_id,name,link,photos,distance,price,rating,location,categories,menu';
const API_VERSION = '1970-01-01' as const;
const MAX_RETRIES = 3;

function createFoursquareClient() {
  return createClient<paths>({
    baseUrl: 'https://api.foursquare.com',
    headers: {
      Authorization: process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY',
    },
  });
}

async function fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable =
        error instanceof TypeError && error.message === 'terminated';
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
    }
  }
  throw new Error('Unreachable');
}

function mapToRestaurant(place: Place): Restaurant {
  const photos = place.photos ?? [];
  const imageUrl =
    photos.length > 0 && photos[0]?.prefix && photos[0]?.suffix
      ? `${photos[0].prefix}original${photos[0].suffix}`
      : '';

  const address = place.location?.formatted_address ?? '';

  return {
    id: place.fsq_id ?? '',
    name: place.name ?? '',
    url: place.link ?? '',
    image_url: imageUrl,
    distance: place.distance ?? 0,
    price: place.price ? '$'.repeat(place.price) : '',
    rating: place.rating ? place.rating / 2 : 0,
    display_address: [address],
    location: { display_address: [address] },
    categories: (place.categories ?? []).map((c) => ({ title: c.name ?? '' })),
    attributes: place.menu ? { menu_url: place.menu } : undefined,
  };
}

async function geocodeAddress(address: string): Promise<string> {
  const client = createFoursquareClient();

  const { data } = await fetchWithRetry(async () =>
    await client.GET('/v3/places/search', {
      params: {
        query: { near: address, query: 'restaurants', limit: 1, fields: 'fsq_id' },
        header: { 'X-Places-Api-Version': API_VERSION },
      },
    }),
  );

  if (!data) {
    throw new Error(`Foursquare geocode failed`);
  }

  const center = data.context?.geo_bounds?.circle?.center;

  if (!center?.latitude || !center.longitude) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return `${center.latitude.toString()},${center.longitude.toString()}`;
}

export async function findRestaurants(address: string, radius: number, maxPriceDollars: string): Promise<Restaurant[]> {
  const ll = await geocodeAddress(address);
  const maxPrice = maxPriceDollars.length;
  const client = createFoursquareClient();

  const results: Restaurant[] = [];

  while (results.length < MAX_RESULTS) {
    const { data } = await fetchWithRetry(async () =>
      await client.GET('/v3/places/search', {
        params: {
          query: {
            query: 'restaurants',
            ll,
            radius,
            categories: '13065',
            limit: PAGE_LIMIT,
            max_price: maxPrice,
            fields: FIELDS,
          },
          header: { 'X-Places-Api-Version': API_VERSION },
        },
      }),
    );

    if (!data) {
      throw new Error(`Foursquare search failed`);
    }

    const places = data.results ?? [];
    results.push(...places.map(mapToRestaurant));

    if (places.length < PAGE_LIMIT) break;
  }

  return results;
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const client = createFoursquareClient();

  const { data } = await fetchWithRetry(async () =>
    await client.GET('/v3/places/search', {
      params: {
        query: { query: restaurantId, limit: 1, fields: FIELDS },
        header: { 'X-Places-Api-Version': API_VERSION },
      },
    }),
  );

  if (!data) {
    throw new Error(`Foursquare place lookup failed`);
  }

  const place = data.results?.[0];

  if (!place) {
    throw new Error(`Restaurant not found: ${restaurantId}`);
  }

  return mapToRestaurant(place);
}
