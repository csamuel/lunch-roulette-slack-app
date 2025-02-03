import { ActionsBlock, AnyBlock, ContextBlock, DividerBlock, HeaderBlock, SectionBlock } from '@slack/web-api';

import { GameState } from '../types/lunchr';
import { Restaurant } from '../types/yelp';

import { RESPIN_ID } from './constants';

const MILES_PER_METER = 0.000621371;

export function toSlackMessageBlocks(game: GameState): AnyBlock[] {
  const { votes, status } = game;
  const { address, radius } = game.configuration;

  const isVotingEnabled = status === 'voting';

  const {
    spinner: { displayName },
    currentOptions: selectedRestaurants,
    possibleOptions,
  } = game;

  // Group votes by restaurant
  const votesByRestaurant = votes.reduce(
    (acc, vote) => {
      const { userId, restaurantId = RESPIN_ID } = vote;
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
      acc[vote.restaurantId || RESPIN_ID] = (acc[vote.restaurantId || RESPIN_ID] || 0) + 1;
      return acc;
    },
    {} as { [key: string]: number },
  );

  const blocks: AnyBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${displayName} started a Lunch Roulette!`,
        emoji: true,
      },
    } as HeaderBlock,
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Here are *${selectedRestaurants.length}* options out of ${selectedRestaurants.length + possibleOptions.length} within ${radius}m from ${address}`,
      },
    } as SectionBlock,
    {
      type: 'divider',
    } as DividerBlock,
  ];

  // Add blocks for each selected restaurant
  selectedRestaurants.forEach((restaurant, index) => {
    blocks.push(
      ...toRestaurantBlock(
        restaurant,
        votesByRestaurant[restaurant.id],
        voteCounts[restaurant.id] || 0,
        isVotingEnabled,
      ),
    );
    if (index < selectedRestaurants.length - 1) {
      blocks.push({ type: 'divider' });
    }
  });

  if (isVotingEnabled) {
    blocks.push(...toRespinBlocks(votesByRestaurant));
    blocks.push({
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
          style: 'danger',
          action_id: 'finalize',
        },
      ],
    } as ActionsBlock);

    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Spins: ${game.spins}*`,
        },
      } as SectionBlock,
      {
        type: 'divider',
      },
    );
  }

  return blocks;
}

function toRespinBlocks(votesByRestaurant: { [x: string]: string[] }): AnyBlock[] {
  // const respinVoters = votesByRestaurant[RESPIN_ID] || [];
  const respinVoterNames = (votesByRestaurant[RESPIN_ID] || []).map((voter) => {
    return `<@${voter}>`;
  });

  const respinVoteText = `\n*Votes: ${respinVoterNames.length}*\n${respinVoterNames.length > 0 ? respinVoterNames.join('\n') : ''}`;

  const respinBlocks = [
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*↪️ Spin again! ↪️*`,
      },
      accessory: {
        type: 'image',
        image_url: 'https://cdn1.iconfinder.com/data/icons/social-messaging-ui-color-round-2/254000/117-1024.png',
        alt_text: 'Spin again',
      },
    } as SectionBlock,
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${respinVoteText}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Select',
          emoji: true,
        },
        style: 'primary',
        value: RESPIN_ID,
        action_id: 'vote',
      },
    } as SectionBlock,
    {
      type: 'divider',
    },
  ];

  return respinBlocks;
}

export function toRestaurantBlock(
  restaurant: Restaurant,
  voters: string[],
  voteCount: number | null,
  votingEnabled: boolean,
): Array<AnyBlock> {
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
    attributes: { menu_url = '' } = {},
  } = restaurant as Restaurant;

  const distanceInMiles = distance ? (distance * MILES_PER_METER).toFixed(2) : null;
  const categoryNames = categories.map((c) => c.title).join(', ');
  const menuDisplay = menu_url ? `*<${menu_url}|View menu>*` : '';

  const voterNames = voters
    ? voters.map((voter) => {
        return `<@${voter}>`;
      })
    : [];

  const voteText = `\n*Votes: ${voteCount}*\n${voterNames.length > 0 ? voterNames.join('\n') : ''}`;

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${url}|${name}>*\n_${categoryNames}_\n\n${menuDisplay}`,
      },
      accessory: {
        type: 'image',
        image_url: image_url || 'https://placehold.co/600x600?text=No%20Photo%20%3A%28',
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
          text: `📍 ${display_address.join(', ')}${distanceInMiles ? ` (${distanceInMiles} miles away)` : ''}`,
        },
      ],
    } as ContextBlock,
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${voteText}`,
      },
      ...(votingEnabled && {
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Select',
            emoji: true,
          },
          style: 'primary',
          value: id,
          action_id: 'vote',
        },
      }),
    } as SectionBlock,
  ];
}
