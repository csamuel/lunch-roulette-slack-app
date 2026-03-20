import type { FoursquarePlace, Restaurant } from '../types/restaurant';

function getApiKey(): string {
  return process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY';
}

const BASE_URL = 'https://api.foursquare.com/v3';
const PAGE_LIMIT = 50;
const MAX_RESULTS = 200;
const FIELDS = 'fsq_id,name,link,photos,distance,price,rating,location,categories,menu';

interface SearchResponse {
  results: FoursquarePlace[];
  context?: {
    next_cursor?: string;
    geo_bounds?: { circle: { center: { latitude: number; longitude: number } } };
  };
}

const headers = () => ({
  Authorization: getApiKey(),
  Accept: 'application/json',
});

function mapToRestaurant(place: FoursquarePlace): Restaurant {
  const imageUrl =
    place.photos && place.photos.length > 0
      ? `${place.photos[0].prefix}original${place.photos[0].suffix}`
      : '';

  const address = place.location.formatted_address;

  return {
    id: place.fsq_id,
    name: place.name,
    url: place.link,
    image_url: imageUrl,
    distance: place.distance ?? 0,
    price: place.price ? '$'.repeat(place.price) : '',
    rating: place.rating ? place.rating / 2 : 0,
    display_address: [address],
    location: { display_address: [address] },
    categories: place.categories.map((c) => ({ title: c.name })),
    attributes: place.menu ? { menu_url: place.menu } : undefined,
  };
}

async function geocodeAddress(address: string): Promise<string> {
  const params = new URLSearchParams({
    near: address,
    query: 'restaurants',
    limit: '1',
    fields: 'fsq_id',
  });

  const response = await fetch(`${BASE_URL}/places/search?${params.toString()}`, {
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`Foursquare geocode failed: ${response.status} ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- response.json() returns unknown at runtime
  const data = (await response.json()) as SearchResponse;
  const center = data.context?.geo_bounds?.circle.center;

  if (!center) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return `${center.latitude.toString()},${center.longitude.toString()}`;
}

export async function findRestaurants(address: string, radius: number, maxPriceDollars: string): Promise<Restaurant[]> {
  const ll = await geocodeAddress(address);
  const maxPrice = maxPriceDollars.length;

  const results: Restaurant[] = [];
  let cursor: string | undefined;

  while (results.length < MAX_RESULTS) {
    const params = new URLSearchParams({
      query: 'restaurants',
      ll,
      radius: radius.toString(),
      categories: '13065',
      limit: PAGE_LIMIT.toString(),
      max_price: maxPrice.toString(),
      fields: FIELDS,
    });

    if (cursor) {
      params.set('cursor', cursor);
    }

    const response = await fetch(`${BASE_URL}/places/search?${params.toString()}`, {
      headers: headers(),
    });

    if (!response.ok) {
      throw new Error(`Foursquare search failed: ${response.status} ${response.statusText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- response.json() returns unknown at runtime
    const data = (await response.json()) as SearchResponse;

    results.push(...data.results.map(mapToRestaurant));

    cursor = data.context?.next_cursor;
    if (!cursor || data.results.length < PAGE_LIMIT) break;
  }

  return results;
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const params = new URLSearchParams({ fields: FIELDS });

  const response = await fetch(`${BASE_URL}/places/${restaurantId}?${params.toString()}`, {
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`Foursquare place lookup failed: ${response.status} ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- response.json() returns unknown at runtime
  const place = (await response.json()) as FoursquarePlace;
  return mapToRestaurant(place);
}
