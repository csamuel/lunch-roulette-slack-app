export interface Restaurant {
  id: string;
  name: string;
  url: string;
  image_url: string;
  distance: number;
  price: string;
  display_address: string[];
  rating: number;
  location: { display_address: string[] };
  categories: { title: string }[];
  attributes?: { menu_url?: string };
}

export interface Vote {
  messageTs: string;
  restaurantId: string;
  userId: string;
}

export interface GameState {
  id?: string;
  spinner: { id: string; displayName: string };
  configuration: {
    address: string;
    radius: number;
    minRating: number;
    maxPrice: string;
  };
  status: 'voting' | 'finalized';
  votes: Vote[];
  currentOptions: Restaurant[];
  spins: number;
  source?: 'slack' | 'web';
}

export interface SearchConfig {
  address: string;
  radius: number;
  minRating: number;
  maxPrice: string;
}
