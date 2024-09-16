import { ModalView, WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Db, MongoClient } from 'mongodb';
import qs from 'qs';
import {
  ActionsBlock,
  ContextBlock,
  DividerBlock,
  SectionBlock,
  MessageBlock,
} from '../../types/slack';
import { Restaurant } from '../../types/yelp';

// Environment variables
const YELP_API_KEY = process.env.YELP_API_KEY || 'YOUR_YELP_API_KEY';
const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI';
const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';
1;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';

// Yelp API parameters
const PAGE_LIMIT = 50; // Max limit per request
const MAX_RESULTS = 200; // Adjust as needed (max 1000)

const MONGO_DB_NAME = 'lunchroulette';
const MONGO_SELECTED_PLACES_COLLECTION = 'selectedplaces';

// Coordinates for 211 E 7th St, Austin, TX 78701
const LATITUDE = 30.2682;
const LONGITUDE = -97.7404;
const RADIUS = 1000; // in meters

// MongoDB setup
let cachedDb: Db;

interface SelectedPlace {
  restaurantId: string;
  lastVisited: Date;
  messageTs: string;
}

const slackClient = new WebClient(SLACK_BOT_TOKEN);

export default async (req: VercelRequest, res: VercelResponse) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Parse URL-encoded body
  const body = typeof req.body === 'string' ? qs.parse(req.body) : req.body;

  // Validate Slack token (optional but recommended)
  if (body.token !== SLACK_VERIFICATION_TOKEN) {
    res.status(401).send('Unauthorized');
    return;
  }

  // Get the subcommand from the text
  const subcommand = (body.text || '').trim().toLowerCase();

  const {
    channel_id: channelId,
    user_id: userId,
    trigger_id: triggerId,
  } = body;

  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    const selectedPlaceCollection = db.collection<SelectedPlace>(
      MONGO_SELECTED_PLACES_COLLECTION,
    );

    if (subcommand === 'reset') {
      // Handle the reset subcommand
      await selectedPlaceCollection.deleteMany({});
      res.json({
        response_type: 'ephemeral',
        text: 'All recently visited places have been reset.',
      });
      return;
    }

    // Handle the configure subcommand
    if (subcommand === 'configure') {
      const view: ModalView = {
        type: 'modal',
        callback_id: 'view-helpdesk',
        title: {
          type: 'plain_text',
          text: 'Submit an issue',
        },
        submit: {
          type: 'plain_text',
          text: 'Submit',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'ticket-title',
            label: {
              type: 'plain_text',
              text: 'Ticket title',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'ticket-title-value',
            },
          },
          {
            type: 'input',
            block_id: 'ticket-desc',
            label: {
              type: 'plain_text',
              text: 'Ticket description',
            },
            element: {
              type: 'plain_text_input',
              multiline: true,
              action_id: 'ticket-desc-value',
            },
          },
        ],
      };

      await slackClient.views.open({
        trigger_id: triggerId,
        view: view,
      });

      // Acknowledge the command
      res.status(200).send('');
      return;
    }

    // Create an array of offsets based on page limit and max results
    const totalOffsets = Array.from(
      { length: Math.ceil(MAX_RESULTS / PAGE_LIMIT) },
      (_, i) => i * PAGE_LIMIT,
    );

    // Fetch all pages in parallel
    const requests = totalOffsets.map((offset) =>
      axios.get('https://api.yelp.com/v3/businesses/search', {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
        },
        params: {
          term: 'restaurants',
          latitude: LATITUDE,
          longitude: LONGITUDE,
          radius: RADIUS,
          limit: PAGE_LIMIT,
          offset: offset,
        },
      }),
    );

    // Wait for all requests to complete
    const responses = await Promise.all(requests);

    // Aggregate all businesses
    const restaurants: Restaurant[] = responses.flatMap(
      (response) => response.data.businesses,
    );

    // Fetch restaurant IDs visited in the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentlyVisitedIds = await selectedPlaceCollection
      .find({ lastVisited: { $gte: twoWeeksAgo } })
      .map((doc) => doc.restaurantId)
      .toArray();

    // Filter out recently visited restaurants
    const filteredRestaurants = restaurants.filter(
      (restaurant: { id: string }) =>
        !recentlyVisitedIds.includes(restaurant.id),
    );

    if (filteredRestaurants.length === 0) {
      res.json({
        response_type: 'ephemeral',
        text: 'No new restaurants available within the past two weeks!',
      });
      return;
    }

    // Randomly select up to 3 restaurants
    const selectedRestaurants = getRandomElements(filteredRestaurants, 3);

    const spinner = await slackClient.users.profile.get({
      user: userId,
    });

    const displayName = spinner.profile?.display_name || 'Unknown User';

    const blocks: MessageBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${displayName} spun the wheel!`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Here are *3* options out of *${filteredRestaurants.length}* walking distance from *211 E 7th St.*`,
        },
      } as SectionBlock,
      {
        type: 'divider',
      } as DividerBlock,
    ];

    // Add blocks for each selected restaurant
    selectedRestaurants.forEach((restaurant, index) => {
      blocks.push(...toMessageBlocks(restaurant));
      if (index < selectedRestaurants.length - 1) {
        blocks.push({ type: 'divider' });
      }
    });

    // Optionally, add actions at the end
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              emoji: true,
              text: 'Pick Other Places?',
            },
            value: 'pick_another',
          },
        ],
      } as ActionsBlock,
    );

    const result = await slackClient.chat.postMessage({
      channel: channelId,
      blocks: blocks,
      text: 'Here are some restaurant options!',
      unfurl_links: false,
      unfurl_media: false,
    });

    // Save the selections to MongoDB
    await Promise.all(
      selectedRestaurants.map((restaurant) =>
        selectedPlaceCollection.updateOne(
          { restaurantId: restaurant.id, messageTs: result.ts },
          { $set: { lastVisited: new Date() } },
          { upsert: true },
        ),
      ),
    );

    res.json({
      response_type: 'ephemeral',
      text: "Looking for lunch options... I'll post them in the channel shortly!",
    });
  } catch (error) {
    console.error('Error:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Sorry, something went wrong while fetching restaurants.',
    });
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

// Function to get up to 'count' random elements from an array
function getRandomElements<T>(array: T[], count: number): T[] {
  const shuffled = array.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function toMessageBlocks(restaurant: Restaurant): Array<MessageBlock> {
  const {
    id,
    name,
    url,
    image_url,
    rating,
    price,
    distance,
    categories,
    location: { display_address },
    attributes: { menu_url },
  } = restaurant;

  const distanceInMiles = (distance * 0.000621371192).toFixed(2);
  const categoryNames = categories.map((c) => c.title).join(', ');
  const menuDisplay = menu_url ? `*<${menu_url}|View menu>*` : '';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${url}|${name}>*\n_${categoryNames}_\n\n${menuDisplay}`,
      },
      accessory: {
        type: 'image',
        image_url: image_url,
        alt_text: name,
      },
    } as SectionBlock,
    {
      type: 'context',
      elements: [
        {
          type: 'plain_text',
          emoji: true,
          text: `⭐️ ${rating}`,
        },
        {
          type: 'plain_text',
          emoji: true,
          text: `💰 ${price || '?'}`,
        },
        {
          type: 'plain_text',
          emoji: true,
          text: `📍 ${display_address.join(', ')} (${distanceInMiles} miles away)`,
        },
      ],
    } as ContextBlock,
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Votes: 0',
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Select',
          emoji: true,
        },
        value: id,
        action_id: 'vote',
      },
    } as SectionBlock,
  ];
}
