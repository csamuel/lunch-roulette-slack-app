import https from 'node:https';

import type { paths } from '../types/foursquare-api';
import type { Restaurant } from '../types/restaurant';

type Place = NonNullable<
  NonNullable<paths['/v3/places/search']['get']['responses']['200']['content']['application/json']['results']>[number]
>;

interface PlacesSearchResponse {
  results?: Place[];
  context?: {
    geo_bounds?: {
      circle?: {
        center?: { latitude?: number; longitude?: number };
      };
    };
  };
}

const PAGE_LIMIT = 50;
const MAX_RESULTS = 200;
const FIELDS = 'fsq_id,name,link,photos,distance,price,rating,location,categories,menu';

// Use Node's native https module to avoid undici socket errors
// with Foursquare's Fastly CDN on Vercel's infrastructure
async function foursquareGet(path: string, params: Record<string, string | number>): Promise<PlacesSearchResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  const url = `https://api.foursquare.com${path}?${searchParams.toString()}`;

  return await new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Authorization: process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY',
        Accept: 'application/json',
        'User-Agent': 'lunch-roulette/1.0',
        Connection: 'close',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Foursquare API error: ${res.statusCode.toString()} ${data}`));
          return;
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
          resolve(JSON.parse(data) as PlacesSearchResponse);
        } catch {
          reject(new Error(`Failed to parse Foursquare response: ${data}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
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
  const data = await foursquareGet('/v3/places/search', {
    near: address,
    query: 'restaurants',
    limit: 1,
    fields: 'fsq_id',
  });

  const center = data.context?.geo_bounds?.circle?.center;

  if (!center?.latitude || !center.longitude) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return `${center.latitude.toString()},${center.longitude.toString()}`;
}

export async function findRestaurants(address: string, radius: number, maxPriceDollars: string): Promise<Restaurant[]> {
  const ll = await geocodeAddress(address);
  const maxPrice = maxPriceDollars.length;

  const results: Restaurant[] = [];

  while (results.length < MAX_RESULTS) {
    const data = await foursquareGet('/v3/places/search', {
      query: 'restaurants',
      ll,
      radius,
      categories: '13065',
      limit: PAGE_LIMIT,
      max_price: maxPrice,
      fields: FIELDS,
    });

    const places = data.results ?? [];
    results.push(...places.map(mapToRestaurant));

    if (places.length < PAGE_LIMIT) break;
  }

  return results;
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const data = await foursquareGet('/v3/places/search', {
    query: restaurantId,
    limit: 1,
    fields: FIELDS,
  });

  const place = data.results?.[0];

  if (!place) {
    throw new Error(`Restaurant not found: ${restaurantId}`);
  }

  return mapToRestaurant(place);
}
