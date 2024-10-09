import { AnyBlock } from '@slack/web-api';
import { Restaurant } from '../yelp';

interface GameState {
  id?: string;
  spinner: Spinner;
  configuration: Configuration;
  status: 'voting' | 'finalized';
  votes: Vote[];
  currentOptions: Restaurant[];
  possibleOptions: Restaurant[];
  spins: number;
}

interface Configuration {
  address: string;
  radius: number;
  channelId: string;
  minRating: number;
  maxPrice: string;
}

interface Spinner {
  id: string;
  displayName: string;
}

interface SelectedPlace {
  restaurantId: string;
  lastVisited: Date;
  messageTs: string;
}

interface Vote {
  messageTs: string;
  restaurantId: string;
  userId: string;
}

interface Action {
  action_id: 'vote' | 'finalize' | 'respin';
  block_id: string;
  text: {
    type: string;
    text: string;
    emoji: boolean;
  };
  value: string;
  type: string;
  action_ts: string;
}

interface Message {
  ts: string;
  blocks: AnyBlock[];
}

interface GameConfig {
  selectedRestaurants: Restaurant[];
  blocks: AnyBlock[];
}

export {
  Action,
  SelectedPlace,
  Configuration,
  Vote,
  Message,
  GameConfig,
  GameState,
  Spinner,
};
