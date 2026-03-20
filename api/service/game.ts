import crypto from 'node:crypto';

import { RESPIN_ID } from '../lib/constants';
import { getRandomElements } from '../lib/utils';
import type { Configuration, GameState, Vote } from '../types/lunchr';
import type { Restaurant } from '../types/restaurant';

import { findRestaurants } from './foursquare';
import { getGame, saveGame } from './mongodb';

export function generateGameId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function generateSpinnerToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function createGame(
  spinner: { id: string; displayName: string },
  config: Configuration,
  opts?: { source?: 'slack' | 'web'; spinnerToken?: string },
): Promise<{ game: GameState; allRestaurants: Restaurant[] }> {
  const { address, radius, maxPrice, minRating } = config;

  const restaurants = (await findRestaurants(address, radius, maxPrice)).filter(
    (restaurant) => restaurant.rating >= minRating,
  );

  const selectedRestaurants = getRandomElements(restaurants, 3);

  const remainingOptions = restaurants.filter(
    (restaurant) => !selectedRestaurants.map((r) => r.id).includes(restaurant.id),
  );

  const game: GameState = {
    configuration: config,
    spinner,
    status: 'voting',
    currentOptions: selectedRestaurants,
    possibleOptions: remainingOptions,
    votes: [],
    spins: 1,
    source: opts?.source,
    spinnerToken: opts?.spinnerToken,
  };

  return { game, allRestaurants: restaurants };
}

export async function addVote(
  gameId: string,
  voterId: string,
  restaurantId: string,
): Promise<GameState | null> {
  const game = await getGame(gameId);
  if (!game) return null;

  const { votes = [] } = game;

  const updatedVotes: Vote[] = [
    ...votes.filter((vote) => vote.userId !== voterId),
    { messageTs: gameId, restaurantId, userId: voterId },
  ];

  const updatedGame: GameState = { ...game, votes: updatedVotes };
  await saveGame(updatedGame);
  return updatedGame;
}

export function getTopVotedRestaurantId(votes: Vote[]): {
  restaurantId: string;
  votes: number;
} {
  if (votes.length === 0) {
    return { restaurantId: '', votes: 0 };
  }

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

export async function respin(
  gameId: string,
  authId: string,
  authMode: 'slack' | 'token',
): Promise<{ game: GameState | null; error?: string }> {
  const game = await getGame(gameId);
  if (!game) return { game: null, error: 'Game not found' };

  const { spinner, possibleOptions, spins = 1 } = game;

  if (authMode === 'slack' && spinner.id !== authId) {
    return { game: null, error: `Only the game owner (${spinner.displayName}) can respin the wheel.` };
  }
  if (authMode === 'token' && game.spinnerToken !== authId) {
    return { game: null, error: 'Invalid spinner token' };
  }

  if (possibleOptions.length === 0) {
    return { game: null, error: 'Cannot respin as there are no more remaining options.' };
  }

  const newSelectedRestaurants = getRandomElements(possibleOptions, 3);

  const remainingOptions = possibleOptions.filter(
    (restaurant) => !newSelectedRestaurants.map((r) => r.id).includes(restaurant.id),
  );

  const updatedGame: GameState = {
    ...game,
    spins: spins + 1,
    votes: [],
    currentOptions: newSelectedRestaurants,
    possibleOptions: remainingOptions,
  };

  await saveGame(updatedGame);
  return { game: updatedGame };
}

export async function finalize(
  gameId: string,
  authId: string,
  authMode: 'slack' | 'token',
): Promise<{ game: GameState | null; winner: Restaurant | null; error?: string }> {
  const game = await getGame(gameId);
  if (!game) return { game: null, winner: null, error: 'Game not found' };

  const { status, votes = [], spinner } = game;

  if (authMode === 'slack' && spinner.id !== authId) {
    return { game: null, winner: null, error: `Only the game owner (${spinner.displayName}) can finalize the voting!` };
  }
  if (authMode === 'token' && game.spinnerToken !== authId) {
    return { game: null, winner: null, error: 'Invalid spinner token' };
  }

  if (votes.length === 0 || status === 'finalized') {
    return { game: null, winner: null, error: 'Slow down turbo, nobody has voted yet!' };
  }

  const { restaurantId: topVotedRestaurantId } = getTopVotedRestaurantId(votes);

  if (topVotedRestaurantId === RESPIN_ID) {
    return { game: null, winner: null, error: 'Spin again has the most votes, cannot finalize game.' };
  }

  const winner = game.currentOptions.find((r) => r.id === topVotedRestaurantId);
  if (!winner) return { game: null, winner: null, error: 'Winner not found' };

  const updatedGame: GameState = { ...game, status: 'finalized' };
  await saveGame(updatedGame);

  return { game: updatedGame, winner };
}
