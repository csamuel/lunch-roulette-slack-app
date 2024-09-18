import { WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { getVotes, recordVote, saveConfiguration } from '../../service/mongodb';
import { getRestaurant } from '../../service/yelp';

import {
  ButtonElement,
  ContextBlock,
  DividerBlock,
  EventType,
  HeaderBlock,
  MessageBlock,
  SectionBlock,
} from '../../types/slack';
import { Action, Message, Vote } from '../../types/lunchr';
import { handleRespin, toMessageBlocks } from './lunchr';
import { Restaurant } from '../../types/yelp';

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
        await handleBlockActions(payload, res);
        return;
      case EventType.VIEW_SUBMISSION:
        await handleViewSubmission(body, payload, res);
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
};

type ValuesType = {
  [key: string]: {
    'address-action'?: ActionType;
    'radius-action'?: ActionType;
  };
};

function extractAddressAndRadius(values: ValuesType) {
  const entries = Object.entries(values) as [
    string,
    { 'address-action'?: ActionType; 'radius-action'?: ActionType },
  ][];

  const addressEntry = entries.find(([, value]) => value['address-action']);
  const radiusEntry = entries.find(([, value]) => value['radius-action']);

  const address = addressEntry?.[1]['address-action']?.value;
  const radius = radiusEntry?.[1]['radius-action']?.value;

  return { address, radius };
}

async function handleViewSubmission(
  body: any,
  payload: any,
  res: VercelResponse,
) {
  const { view } = payload;
  const { state, private_metadata: channelId } = view;
  const { values } = state;

  const { address, radius } = extractAddressAndRadius(values);
  if (address && radius) {
    await saveConfiguration(address, parseInt(radius), channelId);
  }

  const result = await slackClient.chat.postMessage({
    channel: channelId,
    text: `Now using location ${address} with search radius of ${radius} meters.`,
    unfurl_links: false,
    unfurl_media: false,
  });

  res.status(200).send('');
  return;
}

async function handleBlockActions(payload: any, res: VercelResponse) {
  const action = payload.actions[0] as Action;
  const userId = payload.user.id;
  const restaurantId = action.value;
  const channelId = payload.channel.id;

  switch (action.action_id) {
    case 'vote':
      await handleVote(userId, payload.message, restaurantId, channelId);
      res.status(200).send('');
      return;
    case 'finalize':
      await finalizeVote(userId, payload.message, channelId);
      res.status(200).send('');
      return;
    case 'respin':
      await respin(userId, channelId, payload.message);
      res.status(200).send('');
      return;
    default:
      res.status(400).send('Bad Request');
      return;
  }
}

function getTopVotedRestaurantId(votes: Vote[]): string {
  return votes.length === 0
    ? ''
    : Object.entries(
        votes.reduce(
          (acc, { restaurantId }) => (
            (acc[restaurantId] = (acc[restaurantId] || 0) + 1), acc
          ),
          {} as { [key: string]: number },
        ),
      ).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

function filterActionBlocks(blocks: MessageBlock[]): MessageBlock[] {
  return blocks.filter((block) => block.type !== 'actions');
}

async function finalizeVote(
  userId: string,
  message: Message,
  channelId: string,
): Promise<void> {
  const { ts: messageTs } = message;

  const votes: Vote[] = await getVotes(messageTs);
  const topVotedRestaurantId = getTopVotedRestaurantId(votes);
  const winner = (await getRestaurant(topVotedRestaurantId)) as Restaurant;
  console.log('winner', JSON.stringify(winner, null, 2));

  const { blocks: originalBlocks }: { blocks: MessageBlock[] } = message;

  const finalizedBlocks = filterActionBlocks(
    updateBlocksWithVotes(originalBlocks, votes, false),
  );

  console.log('finalizedBlocks', JSON.stringify(finalizedBlocks, null, 2));

  // Use Slack API to update the message
  try {
    await slackClient.chat.update({
      ts: message.ts,
      channel: channelId,
      blocks: finalizedBlocks,
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
    ...toMessageBlocks(winner, false),
    dividerBlock,
    finalizerBlock,
  ];

  // Use Slack API to update the message
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

  // Record the vote
  await recordVote(userId, messageTs, restaurantId);

  // Get all votes for this message
  const votes: Vote[] = await getVotes(messageTs);

  // Update the original message with the vote counts
  const originalBlocks = message.blocks as MessageBlock[];
  const updatedBlocks = updateBlocksWithVotes(originalBlocks, votes, true);

  // Use Slack API to update the message
  try {
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: updatedBlocks,
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

function updateBlocksWithVotes(
  blocks: MessageBlock[],
  votes: Vote[],
  votingEnabled: boolean,
): MessageBlock[] {
  // Group votes by restaurant
  const votesByRestaurant = votes.reduce(
    (acc, vote) => {
      const { restaurantId, userId } = vote;
      return {
        ...acc,
        [restaurantId]: [...(acc[restaurantId] || []), userId],
      };
    },
    {} as { [key: string]: string[] },
  );

  // Count votes per restaurant
  const voteCounts = votes.reduce(
    (acc, vote) => {
      acc[vote.restaurantId] = (acc[vote.restaurantId] || 0) + 1;
      return acc;
    },
    {} as { [key: string]: number },
  );

  return blocks.map((block) => {
    if (isVotingSectionBlock(block)) {
      const sectionBlock = block as SectionBlock;
      const votingButton = sectionBlock.accessory as ButtonElement;
      const restaurantId = votingButton.value || '';
      const voteCount = voteCounts[restaurantId] || 0;
      const voters = votesByRestaurant[restaurantId] || [];

      const voterNames = voters.map((voter) => {
        return `<@${voter}>`;
      });

      const voteText = `\n*Votes: ${voteCount}*\n${voterNames.length > 0 ? voterNames.join('\n') : ''}`;
      return {
        // ...block,
        type: 'section',
        ...(votingEnabled && {
          accessory: {
            ...votingButton,
          },
        }),
        text: {
          type: 'mrkdwn',
          text: voteText,
        },
      } as MessageBlock;
    }
    return block;
  });
}

function isVotingSectionBlock(block: MessageBlock): boolean {
  if (block.type == 'section') {
    const sectionBlock = block as SectionBlock;
    if (sectionBlock.accessory && sectionBlock.accessory.type === 'button') {
      const buttonElement = sectionBlock.accessory as ButtonElement;
      if (buttonElement.action_id === 'vote') {
        return true;
      }
    }
  }
  return false;
}
