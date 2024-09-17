import { WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { Db, MongoClient } from 'mongodb';
import qs from 'qs';
import getRawBody from 'raw-body';
import { ButtonElement, MessageBlock, SectionBlock } from '../../types/slack';

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI';
const SLACK_SIGNING_SECRET =
  process.env.SLACK_SIGNING_SECRET || 'YOUR_SLACK_SIGNING_SECRET';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';
const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

const MONGO_DB_NAME = 'lunchroulette';
const MONGO_VOTES_COLLECTION = 'votes';

// Disable automatic body parsing to capture raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// MongoDB setup
let cachedDb: Db;

interface Vote {
  messageTs: string;
  restaurantId: string;
  userId: string;
}

interface Action {
  action_id: 'vote' | 'finalize';
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

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Parse URL-encoded body
    const body = typeof req.body === 'string' ? qs.parse(req.body) : req.body;
    console.log('body', JSON.stringify(JSON.parse(body)));

    // Validate Slack token (optional but recommended)
    // if (body.token !== SLACK_VERIFICATION_TOKEN) {
    //   res.status(401).send('Unauthorized');
    //   return;
    // }

    // const { body: reqBody } = req;
    const { payload: payloadRaw } = body;
    const payload = JSON.parse(payloadRaw);

    const eventType = payload.type;
    console.log('eventType', eventType);

    // Handle view submission
    if (eventType === 'view_submission') {
      // Respond to Slack (empty 200 response to acknowledge)
      res.status(200).send('');
      return;
    }

    // console.log('payloadJson', JSON.stringify(payloadJson));
    // Capture raw body
    const rawBody = await getRawBody(req);

    // Verify Slack request signature
    if (!isValidSlackRequest(req, rawBody)) {
      res.status(401).send('Unauthorized');
      return;
    }

    // Parse the payload
    // const bodyString = rawBody.toString();
    // const body = qs.parse(bodyString);
    // const payload = JSON.parse(body.payload as string);

    // Extract necessary information
    const userId = payload.user.id;
    const action = payload.actions[0] as Action;

    const restaurantId = action.value;
    const messageTs = payload.message.ts;
    const channelId = payload.channel.id;

    // Connect to MongoDB
    const db = await connectToDatabase();
    const votesCollection = db.collection<Vote>(MONGO_VOTES_COLLECTION);

    // Record the vote
    await votesCollection.updateOne(
      { userId: userId, messageTs: messageTs },
      { $set: { restaurantId: restaurantId } },
      { upsert: true },
    );

    // Get all votes for this message
    const votes = await votesCollection
      .find({ messageTs: messageTs })
      .toArray();

    // Update the original message with the vote counts
    const originalBlocks = payload.message.blocks as MessageBlock[];
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
    // Respond to Slack (empty 200 response to acknowledge)
    res.status(200).send('');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Function to connect to MongoDB
async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db(MONGO_DB_NAME);
  return cachedDb;
}

// Function to verify Slack request signature
function isValidSlackRequest(req: VercelRequest, rawBody: Buffer): boolean {
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const body = rawBody.toString();

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', SLACK_SIGNING_SECRET)
      .update(sigBasestring, 'utf8')
      .digest('hex');

  const slackSignature = req.headers['x-slack-signature'] as string;

  if (!slackSignature || !mySignature) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature),
  );
}

// Function to update blocks with vote counts
function updateBlocksWithVotes(
  blocks: MessageBlock[],
  votes: Vote[],
): MessageBlock[] {
  // Group votes by restaurant using functional programming style
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

      const voteText = `\n*Votes: ${voteCount}*\n${voterNames.length > 0 ? voterNames.join(',') : ''}`;
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
