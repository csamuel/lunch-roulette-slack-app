import { AnyBlock, ModalView } from '@slack/web-api';
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

interface BasePayload {
  token: string;
  type: EventType;
}

interface ActionPayload extends BasePayload {
  actions: Action[];
  user: { id: string };
  channel: { id: string };
  message: Message;
}

type ActionType = {
  type: string;
  value: string;
  selected_option?: { value: string };
};

type ValuesType = {
  [key: string]: {
    'address-action'?: ActionType;
    'radius-action'?: ActionType;
    'min-rating-action'?: ActionType;
    'max-price-action'?: ActionType;
  };
};

interface ModalViewWithState extends ModalView {
  state: { values: ValuesType };
}

interface ViewSubmissionPayload extends BasePayload {
  view: ModalViewWithState;
}

enum EventType {
  VIEW_SUBMISSION = 'view_submission',
  BLOCK_ACTIONS = 'block_actions',
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
  ActionPayload,
  ActionType,
  BasePayload,
  Configuration,
  EventType,
  GameConfig,
  GameState,
  Message,
  ModalViewWithState,
  SelectedPlace,
  Spinner,
  ValuesType,
  ViewSubmissionPayload,
  Vote,
};
