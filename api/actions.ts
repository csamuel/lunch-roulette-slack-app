import type { DividerBlock, HeaderBlock, SectionBlock } from '@slack/types';
import { WebClient } from '@slack/web-api';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { toRestaurantBlock, toSlackMessageBlocks } from './lib/blocks';
import { RESPIN_ID } from './lib/constants';
import { getRandomElements } from './lib/utils';
import { getGame, saveConfiguration, saveGame } from './service/mongodb';
import type { Restaurant } from './types/restaurant';
import { type ActionType, type BasePayload, EventType, type ValuesType, type ViewSubmissionPayload , type ActionPayload, type GameState, type Message, type Vote } from './types/lunchr';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? 'YOUR_SLACK_BOT_TOKEN';
const SLACK_VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN ?? 'YOUR_SLACK_VERIFICATION_TOKEN';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { body } = req as { body: { payload: string } };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown at runtime
    const payload = JSON.parse(body.payload) as BasePayload;

    const { token, type: eventType } = payload;

    // validate slack token
    if (token !== SLACK_VERIFICATION_TOKEN) {
      res.status(401).send('Unauthorized');
      return;
    }

    switch (eventType) {
      case EventType.BLOCK_ACTIONS:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowing parsed payload by event type
        await handleBlockActions(payload as ActionPayload);
        res.status(200).send('');
        return;
      case EventType.VIEW_SUBMISSION:
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowing parsed payload by event type
        await handleViewSubmission(payload as ViewSubmissionPayload);
        res.status(200).send('');
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
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
  const minRatingEntry = entries.find(([, value]) => value['min-rating-action']);
  const maxPriceEntry = entries.find(([, value]) => value['max-price-action']);

  const address = addressEntry?.[1]['address-action']?.value;
  const radius = radiusEntry?.[1]['radius-action']?.value;
  const minRating = minRatingEntry?.[1]['min-rating-action']?.value;
  const maxPrice = maxPriceEntry?.[1]['max-price-action']?.selected_option?.value;

  return { address, radius, minRating, maxPrice };
}

async function handleViewSubmission(payload: ViewSubmissionPayload) {
  const { view } = payload;
  const { state, private_metadata: channelId } = view;
  const { values } = state;

  const { address, radius, minRating, maxPrice } = extractConfig(values);
  if (address && radius && minRating && maxPrice && channelId) {
    await saveConfiguration({ address, radius: parseInt(radius), minRating: parseFloat(minRating), maxPrice, channelId });
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `Now using location ${address} with search radius of ${radius} meters, minimum rating of ${minRating}, and maximum price range of ${maxPrice}.`,
      unfurl_links: false,
      unfurl_media: false,
    });
  }
}

async function handleBlockActions(payload: ActionPayload) {
  const {
    message,
    user: { id: userId },
    actions: [{ action_id: actionId, value: restaurantId }],
    channel: { id: channelId },
  } = payload;

  switch (actionId) {
    case 'vote':
      await handleVote(userId, message, restaurantId, channelId);
      return;
    case 'finalize':
      await handleFinalize(userId, message, channelId);
      return;
    case 'respin':
      await handleRespin(userId, channelId, message);
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
      votes.reduce<Record<string, number>>(
        (acc, { restaurantId }) => {
          acc[restaurantId] = (acc[restaurantId] || 0) + 1;
          return acc;
        },
        {},
      ),
    ).reduce((a, b) => (a[1] >= b[1] ? a : b));

    return { restaurantId, votes: voteCount };
  }
}

async function handleFinalize(userId: string, message: Message, channelId: string): Promise<void> {
  const { ts: gameId } = message;
  const game = await getGame(gameId);

  if (!game) {
    return;
  }

  const { status, votes = [], spinner } = game;
  const { id: spinnerId, displayName } = spinner;

  if (spinnerId !== userId) {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Only the game owner (${displayName}) can finalize the voting!`,
    });
    return;
  }

  // No-op if there are no votes or if game already finalized
  if (votes.length === 0 || status === 'finalized') {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Slow down turbo, nobody has voted yet!`,
    });
    return;
  }

  const { restaurantId: topVotedRestaurantId, votes: winnerVotes } = getTopVotedRestaurantId(votes);

  if (topVotedRestaurantId === RESPIN_ID) {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Spin again has the most votes, cannot finalize game.`,
    });
    return;
  }

  const winner = game.currentOptions.find((r: Restaurant) => r.id === topVotedRestaurantId);

  if (!winner) {
    return;
  }

  const updatedGame: GameState = {
    ...game,
    status: 'finalized',
  };

  await saveGame(updatedGame);

  try {
    await slackClient.chat.update({
      ts: message.ts,
      channel: channelId,
      blocks: toSlackMessageBlocks(updatedGame),
      as_user: true,
    });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
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
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error updating message:', JSON.stringify(error));
  }
}

async function handleVote(userId: string, message: Message, restaurantId: string, channelId: string): Promise<void> {
  const { ts: messageTs } = message;

  const game = await getGame(messageTs);

  if (!game) {
    return;
  }

  const { votes = [] } = game;

  const updatedVotes = [
    // Remove any previous votes by the user
    ...votes.filter((vote) => vote.userId !== userId),
    { messageTs, restaurantId, userId },
  ];

  const updatedGame: GameState = {
    ...game,
    votes: updatedVotes,
  };

  await saveGame(updatedGame);

  try {
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: toSlackMessageBlocks(updatedGame),
      as_user: true,
    });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error updating message:', JSON.stringify(error));
  }
}

export async function handleRespin(userId: string, channelId: string, message: Message): Promise<void> {
  const { ts: messageTs } = message;
  const game = await getGame(messageTs);

  if (!game) {
    return;
  }

  const { spinner, possibleOptions, spins = 1 } = game;

  const { id: spinnerId, displayName } = spinner;

  if (spinnerId !== userId) {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Only the game owner (${displayName}) can respin the wheel.`,
    });
    return;
  }

  if (possibleOptions.length === 0) {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'Cannot respin as there are no more remaining options.',
    });
    return;
  }

  const newSelectedRestaurants = getRandomElements(possibleOptions, 3);

  const remainingOptions = possibleOptions.filter(
    (restaurant: { id: string }) => !newSelectedRestaurants.map((restaurant) => restaurant.id).includes(restaurant.id),
  );

  const updatedGame: GameState = {
    ...game,
    spins: spins + 1,
    votes: [],
    currentOptions: newSelectedRestaurants,
    possibleOptions: remainingOptions,
  };

  await saveGame(updatedGame);

  await slackClient.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks: toSlackMessageBlocks(updatedGame),
    as_user: true,
  });

  
}
