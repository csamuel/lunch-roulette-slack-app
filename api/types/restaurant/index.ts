interface Restaurant {
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
  attributes?: {
    menu_url?: string;
  };
}

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  link: string;
  photos?: { prefix: string; suffix: string }[];
  distance?: number;
  price?: number;
  rating?: number;
  location: { formatted_address: string };
  categories: { name: string }[];
  menu?: string;
}

export type { FoursquarePlace, Restaurant };
