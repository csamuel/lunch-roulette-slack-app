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

interface FoursquareResponse {
  data: PlacesSearchResponse;
  nextPageUrl?: string;
}

const PAGE_LIMIT = 50;
const MAX_RESULTS = 200;
const FIELDS = 'fsq_id,name,link,photos,distance,price,rating,location,categories,menu';
const MAX_RETRIES = 3;
const API_VERSION = '1970-01-01' as const;
const FOURSQUARE_REQUEST_TIMEOUT_MS = 8_000;

function isRetryableRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const rawCode = 'code' in error ? (error as { code?: unknown }).code : undefined;
  const code = typeof rawCode === 'string' ? rawCode : '';
  return code === 'ECONNRESET' || error.message === 'aborted' || error.message === 'terminated';
}

function getNextPageUrl(linkHeader: string | string[] | undefined): string | undefined {
  const header = Array.isArray(linkHeader) ? linkHeader.join(',') : linkHeader;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(',')) {
    const trimmedPart = part.trim();
    const match = /^<([^>]+)>\s*;\s*rel="([^"]+)"$/u.exec(trimmedPart);
    if (match?.[2] === 'next') {
      return match[1];
    }
  }

  return undefined;
}

// Use Node's native https module to avoid undici socket errors
// with Foursquare's Fastly CDN on Vercel's infrastructure
async function foursquareGet(path: string, params: Record<string, string | number>): Promise<FoursquareResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  const url = `https://api.foursquare.com${path}?${searchParams.toString()}`;
  return await foursquareGetByUrl(url);
}

async function foursquareGetByUrl(url: string): Promise<FoursquareResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        let ended = false;

        const settleResolve = (value: FoursquareResponse) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const settleReject = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        const req = https.get(
          url,
          {
            agent: false,
            family: 4,
            headers: {
              Authorization: process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY',
              Accept: 'application/json',
              'X-Places-Api-Version': API_VERSION,
              'User-Agent': 'lunch-roulette/1.0',
              Connection: 'close',
            },
          },
          (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              data += chunk;
            });
            res.on('end', () => {
              ended = true;
              if (res.statusCode && res.statusCode >= 400) {
                settleReject(new Error(`Foursquare API error: ${res.statusCode.toString()} ${data}`));
                return;
              }
              try {
                settleResolve({
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
                  data: JSON.parse(data) as PlacesSearchResponse,
                  nextPageUrl: getNextPageUrl(res.headers.link),
                });
              } catch {
                settleReject(new Error(`Failed to parse Foursquare response: ${data}`));
              }
            });
            res.on('aborted', () => {
              settleReject(new Error('Foursquare response aborted'));
            });
            res.on('close', () => {
              if (!ended) {
                settleReject(new Error('Foursquare response closed before end'));
              }
            });
            res.on('error', settleReject);
          },
        );
        req.setTimeout(FOURSQUARE_REQUEST_TIMEOUT_MS, () => {
          req.destroy(new Error(`Foursquare request timed out after ${FOURSQUARE_REQUEST_TIMEOUT_MS.toString()}ms`));
        });
        req.on('error', settleReject);
      });
    } catch (error: unknown) {
      if (!isRetryableRequestError(error) || attempt === MAX_RETRIES) {
        throw error;
      }
    }
  }

  throw new Error('Unreachable');
}

function mapToRestaurant(place: Place): Restaurant {
  const photos = place.photos ?? [];
  const imageUrl =
    photos.length > 0 && photos[0]?.prefix && photos[0]?.suffix ? `${photos[0].prefix}original${photos[0].suffix}` : '';

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
  const { data } = await foursquareGet('/v3/places/search', {
    near: address,
    limit: 1,
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
  const seenRestaurantIds = new Set<string>();
  const visitedPageUrls = new Set<string>();

  let nextPageUrl: string | undefined;
  let response = await foursquareGet('/v3/places/search', {
    query: 'restaurants',
    ll,
    radius,
    categories: '13065',
    limit: PAGE_LIMIT,
    max_price: maxPrice,
    fields: FIELDS,
  });
  while (true) {
    for (const place of response.data.results ?? []) {
      const restaurant = mapToRestaurant(place);
      if (!restaurant.id || seenRestaurantIds.has(restaurant.id)) {
        continue;
      }

      seenRestaurantIds.add(restaurant.id);
      results.push(restaurant);

      if (results.length >= MAX_RESULTS) {
        return results;
      }
    }

    nextPageUrl = response.nextPageUrl;
    if (!nextPageUrl || visitedPageUrls.has(nextPageUrl)) {
      break;
    }

    visitedPageUrls.add(nextPageUrl);
    response = await foursquareGetByUrl(nextPageUrl);
  }

  return results;
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const { data } = await foursquareGet('/v3/places/search', {
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
