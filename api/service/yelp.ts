import axios from 'axios';

import { Restaurant } from '../types/yelp';

const YELP_API_KEY = process.env.YELP_API_KEY || 'YOUR_YELP_API_KEY';
const PAGE_LIMIT = 50; // Max limit per request
const MAX_RESULTS = 200; // Adjust as needed (max 1000)

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const response = await axios.get(`https://api.yelp.com/v3/businesses/${restaurantId}`, {
    headers: {
      Authorization: `Bearer ${YELP_API_KEY}`,
    },
  });

  return response.data;
}

export async function findRestaurants(address: string, radius: number, maxPriceDollars: string): Promise<Restaurant[]> {
  const totalOffsets = Array.from({ length: Math.ceil(MAX_RESULTS / PAGE_LIMIT) }, (_, i) => i * PAGE_LIMIT);

  // Fetch all pages in parallel
  const requests = totalOffsets.map((offset) =>
    axios.get('https://api.yelp.com/v3/businesses/search', {
      headers: {
        Authorization: `Bearer ${YELP_API_KEY}`,
      },
      params: {
        term: 'restaurants',
        location: address,
        radius: radius,
        limit: PAGE_LIMIT,
        offset: offset,
        open_now: true,
        price: dollarStringToCommaSeparated(maxPriceDollars),
      },
    }),
  );

  // Wait for all requests to complete
  const responses = await Promise.all(requests);

  // Aggregate all businesses
  const restaurants: Restaurant[] = responses.flatMap((response) => response.data.businesses);
  return restaurants;
}

function dollarStringToCommaSeparated(dollars: string): string {
  return Array.from({ length: dollars.length }, (_, i) => (i + 1).toString()).join(',');
}
