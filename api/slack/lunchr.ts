import { ModalView, WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ActionsBlock,
  ContextBlock,
  DividerBlock,
  SectionBlock,
  MessageBlock,
} from '../../types/slack';
import { GameConfig } from '../../types/lunchr';
import { Restaurant } from '../../types/yelp';
import {
  getSelectedPlaces,
  resetSelectedPlaces,
  saveSelectedPlaces,
} from '../../service/mongodb';
import { findRestaurants } from '../../service/yelp';

const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';

const DEFAULT_ADDRESS = '211 E 7th St, Austin, TX 78701';
const DEFAULT_RADIUS = 1000; // in meters

const slackClient = new WebClient(SLACK_BOT_TOKEN);

export default async (req: VercelRequest, res: VercelResponse) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { body } = req;

  // validate slack tocken
  if (body.token !== SLACK_VERIFICATION_TOKEN) {
    res.status(401).send('Unauthorized');
    return;
  }

  const subcommand = (body.text || '').trim().toLowerCase();

  const {
    channel_id: channelId,
    user_id: userId,
    trigger_id: triggerId,
  } = body;

  try {
    switch (subcommand) {
      case 'reset':
        await handleReset();
        res.json({
          response_type: 'ephemeral',
          text: 'Restaurant list has been reset.',
        });
        return;
      case 'configure':
        await handleConfigure(triggerId, channelId);
        res.status(200).send('');
        return;
      default:
        break;
    }
    await handleNewGame(userId, channelId, res);
    return;
  } catch (error) {
    console.error('Error:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Sorry, something went wrong while fetching restaurants.',
    });
  }
};

async function handleReset(): Promise<void> {
  await resetSelectedPlaces();
}

async function handleConfigure(
  triggerId: string,
  channelId: string,
): Promise<void> {
  const view: ModalView = {
    type: 'modal',
    callback_id: 'configure-modal',
    title: {
      type: 'plain_text',
      text: 'Configuration',
    },
    submit: {
      type: 'plain_text',
      text: 'Submit',
    },
    blocks: [
      {
        type: 'input',
        element: {
          type: 'plain_text_input',
          action_id: 'address-action',
          initial_value: DEFAULT_ADDRESS,
        },
        label: {
          type: 'plain_text',
          text: 'Address',
          emoji: true,
        },
      },
      {
        type: 'input',
      },
      {
        type: 'input',
        element: {
          type: 'number_input',
          is_decimal_allowed: false,
          action_id: 'radius-action',
          initial_value: DEFAULT_RADIUS.toString(),
        },
        label: {
          type: 'plain_text',
          text: 'Radius (in meters)',
          emoji: true,
        },
      },
    ],
  };

  await slackClient.views.open({
    trigger_id: triggerId,
    view: view,
  });
}

async function buildNewGame(userId: string): Promise<GameConfig> {
  const restaurants = await findRestaurants(DEFAULT_ADDRESS, DEFAULT_RADIUS);

  // Fetch restaurant IDs visited in the last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentlyVisitedIds = await getSelectedPlaces();

  // Filter out recently visited restaurants
  const filteredRestaurants = restaurants.filter(
    (restaurant: { id: string }) => !recentlyVisitedIds.includes(restaurant.id),
  );

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
        text: `${displayName} started a Lunch Roulette!`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Here are *3* options out of *${filteredRestaurants.length}* walking distance from ${DEFAULT_ADDRESS}`,
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

  // Add actions
  blocks.push(
    {
      type: 'divider',
    },
    {
      block_id: 'action_block',
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Spin Again',
          },
          action_id: 'respin',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            emoji: true,
            text: 'Finalize!',
          },
          action_id: 'finalize',
        },
      ],
    } as ActionsBlock,
  );
  return {
    blocks,
    selectedRestaurants,
  };
}

export async function handleRespin(
  userId: string,
  channelId: string,
  messageTs: string,
): Promise<void> {
  const { blocks, selectedRestaurants }: GameConfig =
    await buildNewGame(userId);

  const result = await slackClient.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks: blocks,
    as_user: true,
  });

  if (result.ts) {
    await saveSelectedPlaces(selectedRestaurants, result.ts);
  }
}

async function handleNewGame(
  userId: string,
  channelId: string,
  res: VercelResponse,
) {
  const { blocks, selectedRestaurants }: GameConfig =
    await buildNewGame(userId);

  const result = await slackClient.chat.postMessage({
    channel: channelId,
    blocks: blocks,
    text: 'Here are some restaurant options!',
    unfurl_links: false,
    unfurl_media: false,
  });

  // Save the selections to MongoDB
  if (result.ts) {
    await saveSelectedPlaces(selectedRestaurants, result.ts);
  }

  res.json({
    response_type: 'ephemeral',
    text: "Looking for lunch options... I'll post them in the channel shortly!",
  });
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
