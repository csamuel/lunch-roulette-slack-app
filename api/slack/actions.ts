import { WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Db, MongoClient } from 'mongodb';
import {
  ButtonElement,
  EventType,
  MessageBlock,
  SectionBlock,
} from '../../types/slack';
import { Action, Message, Vote } from '../../types/lunchr';
import { handleRespin } from './lunchr';

const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';
const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

const MONGO_DB_NAME = 'lunchroulette';
const MONGO_VOTES_COLLECTION = 'votes';

let cachedDb: Db;

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Only accept POST requests
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
        await handleViewSubmission(payload, res);
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

async function handleViewSubmission(payload: any, res: VercelResponse) {
  res.status(200).send('');
  return;
}

async function handleBlockActions(payload: any, res: VercelResponse) {
  const action = payload.actions[0] as Action;
  const userId = payload.user.id;
  const restaurantId = action.value;
  const channelId = payload.channel.id;

  console.log('action', JSON.stringify(action, null, 2));

  switch (action.action_id) {
    case 'vote':
      await handleVote(userId, payload.message, restaurantId, channelId);
      res.status(200).send('');
      return;
    case 'finalize':
      res.status(400).send('Not yet implemented');
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

async function handleVote(
  userId: string,
  message: Message,
  restaurantId: string,
  channelId: string,
): Promise<void> {
  const db = await connectToDatabase();
  const votesCollection = db.collection<Vote>(MONGO_VOTES_COLLECTION);

  const { ts: messageTs } = message;

  // Record the vote
  await votesCollection.updateOne(
    { userId: userId, messageTs: messageTs },
    { $set: { restaurantId: restaurantId } },
    { upsert: true },
  );

  // Get all votes for this message
  const votes: Vote[] = await votesCollection
    .find({ messageTs: messageTs })
    .toArray();

  // Update the original message with the vote counts
  const originalBlocks = message.blocks as MessageBlock[];
  const updatedBlocks = updateBlocksWithVotes(originalBlocks, votes);

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

async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db(MONGO_DB_NAME);
  return cachedDb;
}

function updateBlocksWithVotes(
  blocks: MessageBlock[],
  votes: Vote[],
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
        ...block,
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
