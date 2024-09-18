import { MessageBlock } from '../slack';
import { Restaurant } from '../yelp';

interface SelectedPlace {
  restaurantId: string;
  lastVisited: Date;
  messageTs: string;
}

interface Configuration {
  address: string;
  radius: number;
  channelId: string;
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
  blocks: MessageBlock[];
}

interface GameConfig {
  selectedRestaurants: Restaurant[];
  blocks: MessageBlock[];
}

export { Action, SelectedPlace, Configuration, Vote, Message, GameConfig };
