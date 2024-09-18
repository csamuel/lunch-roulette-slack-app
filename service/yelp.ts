import axios from 'axios';
import { Restaurant } from '../types/yelp';

const YELP_API_KEY = process.env.YELP_API_KEY || 'YOUR_YELP_API_KEY';

export async function getRestaurant(restauranId: string): Promise<Restaurant> {
  const response = await axios.get(
    `https://api.yelp.com/v3/businesses/${restauranId}`,
    {
      headers: {
        Authorization: `Bearer ${YELP_API_KEY}`,
      },
    },
  );

  return response.data;
}
