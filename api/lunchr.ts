import { ModalView, PlainTextInput, WebClient } from '@slack/web-api';
import { VercelRequest, VercelResponse } from '@vercel/node';

import { toSlackMessageBlocks } from './lib/blocks';
import { getRandomElements } from './lib/utils';
import { findActiveGame, getConfiguration, saveGame } from './service/mongodb';
import { findRestaurants } from './service/yelp';
import { Configuration, GameState } from './types/lunchr';

const SLACK_VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN || 'YOUR_SLACK_VERIFICATION_TOKEN';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'YOUR_SLACK_BOT_TOKEN';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

export default async (req: VercelRequest, res: VercelResponse) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { body } = req;
  const { token, text, channel_id: channelId, user_id: userId, trigger_id: triggerId } = body;

  // validate slack tocken
  if (token !== SLACK_VERIFICATION_TOKEN) {
    res.status(401).send('Unauthorized');
    return;
  }

  const subcommand = text?.trim() || '';

  switch (subcommand) {
    case 'configure':
      await handleConfigure(triggerId, channelId);
      res.status(200).send('');
      return;
    default:
      break;
  }

  const configuration = await getConfiguration(channelId);

  if (!configuration) {
    res.json({
      response_type: 'ephemeral',
      text: 'Set a location with `/lunchr configure` to start a Lunch Roulette!',
    });
    return;
  }

  const activeGame = await findActiveGame(channelId);

  if (activeGame) {
    res.json({
      response_type: 'ephemeral',
      text: 'Please finalize the current Lunch Roulette before starting a new one.',
    });
    return;
  }

  const game: GameState = await initNewGame(userId, configuration);

  const result = await slackClient.chat.postMessage({
    channel: channelId,
    blocks: toSlackMessageBlocks(game),
    text: 'Here are some lunch options...',
    unfurl_links: false,
    unfurl_media: false,
  });

  // persist the game state
  await saveGame({
    ...game,
    id: result.ts,
  });

  res.status(200).send('');
  return;
};

async function initNewGame(spinnerId: string, configuration: Configuration): Promise<GameState> {
  const { address, radius, maxPrice } = configuration;

  const restaurants = (await findRestaurants(address, radius, maxPrice)).filter(
    (restaurant: { rating: number }) => restaurant.rating >= configuration.minRating,
  );

  const selectedRestaurants = getRandomElements(restaurants, 3);

  const spinner = await slackClient.users.profile.get({
    user: spinnerId,
  });

  const remainingOptions = restaurants.filter(
    (restaurant: { id: string }) => !selectedRestaurants.map((restaurant) => restaurant.id).includes(restaurant.id),
  );

  const displayName = spinner.profile?.display_name || 'Unknown User';

  const game: GameState = {
    configuration: configuration,
    spinner: { id: spinnerId, displayName: displayName },
    status: 'voting',
    currentOptions: selectedRestaurants,
    possibleOptions: remainingOptions,
    votes: [],
    spins: 1,
  };

  return game;
}

async function handleConfigure(triggerId: string, channelId: string): Promise<void> {
  const gameConfig = await getConfiguration(channelId);

  const { address, radius, minRating, maxPrice } = gameConfig || {};

  const initialAddress = address || '1600 Pennsylvania Avenue Washington, DC 20500';
  const initialRadius = radius ? radius.toString() : '1000';
  const initialMinRating = minRating ? minRating.toString() : '3.0';
  const initialMaxPrice = maxPrice || '$$$';

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
    private_metadata: channelId,
    blocks: [
      {
        type: 'input',
        element: {
          type: 'plain_text_input',
          action_id: 'address-action',
          initial_value: initialAddress,
        } as PlainTextInput,
        label: {
          type: 'plain_text',
          text: 'Address',
          emoji: true,
        },
      },
      {
        type: 'input',
        element: {
          type: 'number_input',
          is_decimal_allowed: false,
          action_id: 'radius-action',
          initial_value: initialRadius,
        },
        label: {
          type: 'plain_text',
          text: 'Radius (in meters)',
          emoji: true,
        },
      },
      {
        type: 'input',
        element: {
          type: 'number_input',
          is_decimal_allowed: true,
          action_id: 'min-rating-action',
          initial_value: initialMinRating,
        },
        label: {
          type: 'plain_text',
          text: 'Minimum rating (0.1-5.0)',
          emoji: true,
        },
      },
      {
        type: 'input',
        label: {
          type: 'plain_text',
          text: 'Max price range ($ - $$$$)',
        },
        element: {
          type: 'static_select',
          action_id: 'max-price-action',
          initial_option: {
            text: {
              type: 'plain_text',
              text: initialMaxPrice,
            },
            value: initialMaxPrice,
          },
          options: ['$', '$$', '$$$', '$$$$'].map((value) => ({
            text: {
              type: 'plain_text',
              text: value,
            },
            value: value,
          })),
        },
      },
    ],
  };

  await slackClient.views.open({
    trigger_id: triggerId,
    view: view,
  });
}
