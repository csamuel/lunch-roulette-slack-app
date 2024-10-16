import {
  AnyBlock,
  DividerBlock,
  HeaderBlock,
  SectionBlock,
  WebClient,
} from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { getGame, saveConfiguration, saveGame } from '../service/mongodb';
import { getRestaurant } from '../service/yelp';

import { EventType } from '../types/slack';
import { Action, Vote, Message, GameState } from '../types/lunchr';
import { Restaurant } from '../types/yelp';
import { getRandomElements } from '../lib/utils';
import { toRestaurantBlock, toSlackMessageBlocks } from '../lib/blocks';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';
const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { body } = req;
    const payload = JSON.parse(body.payload);

    const { token, type: eventType } = payload as {
      token: string;
      type: EventType;
    };

    // validate slack token
    if (token !== SLACK_VERIFICATION_TOKEN) {
      res.status(401).send('Unauthorized');
      return;
    }

    switch (eventType) {
      case EventType.BLOCK_ACTIONS:
        await handleBlockActions(payload);
        res.status(200).send('');
        return;
      case EventType.VIEW_SUBMISSION:
        await handleViewSubmission(body, payload);
        res.status(200).send('');
        return;
      default:
        res.status(400).send('Bad Request');
        return;
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
};

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

function extractConfig(values: ValuesType) {
  const entries = Object.entries(values) as [
    string,
    {
      'address-action'?: ActionType;
      'radius-action'?: ActionType;
      'min-rating-action'?: ActionType;
      'max-price-action'?: ActionType;
    },
  ][];

  const addressEntry = entries.find(([, value]) => value['address-action']);
  const radiusEntry = entries.find(([, value]) => value['radius-action']);
  const minRatingEntry = entries.find(
    ([, value]) => value['min-rating-action'],
  );
  const maxPriceEntry = entries.find(([, value]) => value['max-price-action']);

  const address = addressEntry?.[1]['address-action']?.value;
  const radius = radiusEntry?.[1]['radius-action']?.value;
  const minRating = minRatingEntry?.[1]['min-rating-action']?.value;
  const maxPrice =
    maxPriceEntry?.[1]['max-price-action']?.selected_option?.value;

  return { address, radius, minRating, maxPrice };
}

async function handleViewSubmission(body: any, payload: any) {
  const { view } = payload;
  const { state, private_metadata: channelId } = view;
  const { values } = state;

  const { address, radius, minRating, maxPrice } = extractConfig(values);
  if (address && radius && minRating && maxPrice) {
    await saveConfiguration(
      address,
      parseInt(radius),
      parseFloat(minRating),
      maxPrice,
      channelId,
    );
  }

  await slackClient.chat.postMessage({
    channel: channelId,
    text: `Now using location ${address} with search radius of ${radius} meters, minimum rating of ${minRating}, and maximum price range of ${maxPrice}.`,
    unfurl_links: false,
    unfurl_media: false,
  });
}

async function handleBlockActions(payload: any) {
  const action = payload.actions[0] as Action;
  const userId = payload.user.id;
  const restaurantId = action.value;
  const channelId = payload.channel.id;

  switch (action.action_id) {
    case 'vote':
      await handleVote(userId, payload.message, restaurantId, channelId);
      return;
    case 'finalize':
      await finalizeVote(userId, payload.message, channelId);
      return;
    case 'respin':
      await respin(userId, channelId, payload.message);
      return;
    default:
      return;
  }
}

function getTopVotedRestaurantId(votes: Vote[]): {
  restaurantId: string;
  votes: number;
} {
  if (votes.length === 0) {
    return { restaurantId: '', votes: 0 };
  } else {
    const [restaurantId, voteCount] = Object.entries(
      votes.reduce(
        (acc, { restaurantId }) => {
          acc[restaurantId] = (acc[restaurantId] || 0) + 1;
          return acc;
        },
        {} as { [key: string]: number },
      ),
    ).reduce((a, b) => (a[1] >= b[1] ? a : b));

    return { restaurantId, votes: voteCount };
  }
}

async function finalizeVote(
  userId: string,
  message: Message,
  channelId: string,
): Promise<void> {
  const { ts: gameId } = message;

  const game = await getGame(gameId);

  const { status, votes } = game || {};

  // No-op if there are no votes or if game already finalized
  if (!votes || status === 'finalized') {
    return;
  }

  const { restaurantId: topVotedRestaurantId, votes: winnerVotes } =
    getTopVotedRestaurantId(votes);
  const winner = (await getRestaurant(topVotedRestaurantId)) as Restaurant;

  const updatedGame = {
    ...game,
    status: 'finalized',
  } as GameState;

  await saveGame(updatedGame);

  try {
    await slackClient.chat.update({
      ts: message.ts,
      channel: channelId,
      blocks: toSlackMessageBlocks(updatedGame),
      as_user: true,
    });
  } catch (error) {
    console.error('Error updating message:', JSON.stringify(error));
  }

  const dividerBlock = {
    type: 'divider',
  } as DividerBlock;

  const winnerBlock = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🥇 ${winner.name} is the winner!`,
      emoji: true,
    },
  } as HeaderBlock;

  const finalizerBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `Voting ended by <@${userId}>`,
    },
  } as SectionBlock;

  const winnerBlocks = [
    dividerBlock,
    winnerBlock,
    ...toRestaurantBlock(winner, [], winnerVotes, false),
    dividerBlock,
    finalizerBlock,
  ];

  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      blocks: winnerBlocks,
      text: `🥇 ${winner.name} is the winner!`,
      as_user: true,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (error) {
    console.error('Error updating message:', JSON.stringify(error));
  }
}

async function handleVote(
  userId: string,
  message: Message,
  restaurantId: string,
  channelId: string,
): Promise<void> {
  const { ts: messageTs } = message;

  const game = await getGame(messageTs);

  const { votes = [] } = game || {};

  const updatedVotes = [
    // Remove any previous votes by the user
    ...votes.filter((vote) => vote.userId !== userId),
    { messageTs, restaurantId, userId },
  ];

  const updatedGame = {
    ...game,
    votes: updatedVotes,
  } as GameState;

  await saveGame(updatedGame);

  try {
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: toSlackMessageBlocks(updatedGame),
      as_user: true,
    });
  } catch (error) {
    console.error('Error updating message:', JSON.stringify(error));
  }
}

async function respin(userId: string, channelId: string, message: Message) {
  const { ts: messageTs } = message;
  await handleRespin(userId, channelId, messageTs);
}

export async function handleRespin(
  userId: string,
  channelId: string,
  messageTs: string,
): Promise<void> {
  const game = await getGame(messageTs);

  const { possibleOptions, spins = 1 } = game || {};

  if (!possibleOptions) {
    return;
  }

  const newSelectedRestaurants = getRandomElements(possibleOptions, 3);

  const remainingOptions = possibleOptions.filter(
    (restaurant: { id: string }) =>
      !newSelectedRestaurants
        .map((restaurant) => restaurant.id)
        .includes(restaurant.id),
  );

  const updatedGame = {
    ...game,
    spins: spins + 1,
    currentOptions: newSelectedRestaurants,
    possibleOptions: remainingOptions,
  } as GameState;

  await saveGame(updatedGame);

  await slackClient.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks: toSlackMessageBlocks(updatedGame),
    as_user: true,
  });

  return;
}
