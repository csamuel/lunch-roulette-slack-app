import { MongoClient } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';
import { RESPIN_ID } from '../../lib/constants';
import { getRandomElements } from '../../lib/utils';
import { findRestaurants } from '../foursquare';
import { findActiveGame, getConfiguration, getGame, saveConfiguration, saveGame } from '../mongodb';
import type { GameState } from '../../types/lunchr';
import type { Restaurant } from '../../types/restaurant';

const METERS_PER_MILE = 1609.34;
const TEST_CHANNEL_ID = `test-channel-${Date.now().toString()}`;
const TEST_USER_ID = 'U_TEST_USER';
const TEST_USER_2 = 'U_TEST_USER_2';

let gameId: string;
let allRestaurants: Restaurant[];

afterAll(async () => {
  // Clean up test data
  const uri = process.env.MONGODB_URI ?? '';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('lunchroulette');
  await db.collection('configurations').deleteMany({ channelId: TEST_CHANNEL_ID });
  await db.collection('gamestates').deleteMany({ 'configuration.channelId': TEST_CHANNEL_ID });
  await client.close();
});

describe('Game lifecycle (Foursquare + MongoDB, no Slack)', () => {
  it('step 1: save and retrieve a channel configuration', async () => {
    await saveConfiguration({
      address: '78704',
      radius: Math.round(2 * METERS_PER_MILE),
      minRating: 3.0,
      maxPrice: '$$$',
      channelId: TEST_CHANNEL_ID,
    });

    const config = await getConfiguration(TEST_CHANNEL_ID);

    expect(config).not.toBeNull();
    expect(config!.address).toBe('78704');
    expect(config!.radius).toBe(Math.round(2 * METERS_PER_MILE));
    expect(config!.minRating).toBe(3.0);
    expect(config!.maxPrice).toBe('$$$');
  }, 10_000);

  it('step 2: find restaurants from Foursquare and filter by min rating', async () => {
    const config = (await getConfiguration(TEST_CHANNEL_ID))!;

    const restaurants = await findRestaurants(config.address, config.radius, config.maxPrice);

    expect(restaurants.length).toBeGreaterThan(0);

    // Apply min rating filter (same as lunchr.ts does)
    allRestaurants = restaurants.filter((r) => r.rating >= config.minRating);

    expect(allRestaurants.length).toBeGreaterThan(0);

    // Every restaurant should have valid fields
    for (const r of allRestaurants) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.rating).toBeGreaterThanOrEqual(config.minRating);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  }, 15_000);

  it('step 3: create a new game with 3 random restaurants', async () => {
    const config = (await getConfiguration(TEST_CHANNEL_ID))!;
    const selectedRestaurants = getRandomElements(allRestaurants, 3);
    const remainingOptions = allRestaurants.filter(
      (r) => !selectedRestaurants.some((s) => s.id === r.id),
    );

    gameId = `test-game-${Date.now().toString()}`;

    const game: GameState = {
      id: gameId,
      configuration: config,
      spinner: { id: TEST_USER_ID, displayName: 'Test User' },
      status: 'voting',
      currentOptions: selectedRestaurants,
      possibleOptions: remainingOptions,
      votes: [],
      spins: 1,
    };

    await saveGame(game);

    const savedGame = await getGame(gameId);
    expect(savedGame).not.toBeNull();
    expect(savedGame!.status).toBe('voting');
    expect(savedGame!.currentOptions).toHaveLength(3);
    expect(savedGame!.spinner.id).toBe(TEST_USER_ID);
  });

  it('step 4: verify active game is found for the channel', async () => {
    const activeGame = await findActiveGame(TEST_CHANNEL_ID);

    expect(activeGame).not.toBeNull();
    expect(activeGame!.id).toBe(gameId);
  });

  it('step 5: cast votes from two users', async () => {
    const game = (await getGame(gameId))!;
    const firstOption = game.currentOptions[0];

    // User 1 votes for the first restaurant
    const votesAfterFirst = [
      { messageTs: gameId, restaurantId: firstOption.id, userId: TEST_USER_ID },
    ];

    await saveGame({ ...game, votes: votesAfterFirst });

    // User 2 also votes for the first restaurant
    const votesAfterSecond = [
      ...votesAfterFirst,
      { messageTs: gameId, restaurantId: firstOption.id, userId: TEST_USER_2 },
    ];

    await saveGame({ ...game, votes: votesAfterSecond });

    const updatedGame = (await getGame(gameId))!;
    expect(updatedGame.votes).toHaveLength(2);
    expect(updatedGame.votes.every((v) => v.restaurantId === firstOption.id)).toBe(true);
  });

  it('step 6: respin draws new restaurants from the pool', async () => {
    const game = (await getGame(gameId))!;
    const previousOptionIds = game.currentOptions.map((r) => r.id);

    const newSelected = getRandomElements(game.possibleOptions, 3);
    const newRemaining = game.possibleOptions.filter(
      (r) => !newSelected.some((s) => s.id === r.id),
    );

    const respunGame: GameState = {
      ...game,
      spins: game.spins + 1,
      votes: [],
      currentOptions: newSelected,
      possibleOptions: newRemaining,
    };

    await saveGame(respunGame);

    const savedGame = (await getGame(gameId))!;
    expect(savedGame.spins).toBe(2);
    expect(savedGame.votes).toHaveLength(0);
    expect(savedGame.currentOptions).toHaveLength(3);

    // New options should be different from previous (extremely likely with a decent pool)
    const newOptionIds = savedGame.currentOptions.map((r) => r.id);
    const overlap = newOptionIds.filter((id) => previousOptionIds.includes(id));
    expect(overlap.length).toBeLessThan(3);
  });

  it('step 7: vote again and finalize the game using stored data', async () => {
    const game = (await getGame(gameId))!;
    const winner = game.currentOptions[0];

    // Both users vote for the same restaurant
    const votes = [
      { messageTs: gameId, restaurantId: winner.id, userId: TEST_USER_ID },
      { messageTs: gameId, restaurantId: winner.id, userId: TEST_USER_2 },
    ];

    await saveGame({ ...game, votes });

    // Finalize: look up winner from stored currentOptions (no API call)
    const gameBeforeFinalize = (await getGame(gameId))!;
    const topVotedId = winner.id;
    const foundWinner = gameBeforeFinalize.currentOptions.find((r) => r.id === topVotedId);

    expect(foundWinner).toBeDefined();
    expect(foundWinner!.name).toBe(winner.name);
    expect(foundWinner!.id).toBe(winner.id);

    // Mark game as finalized
    await saveGame({ ...gameBeforeFinalize, status: 'finalized' });

    const finalizedGame = (await getGame(gameId))!;
    expect(finalizedGame.status).toBe('finalized');
  });

  it('step 8: no active game after finalization', async () => {
    const activeGame = await findActiveGame(TEST_CHANNEL_ID);
    expect(activeGame).toBeNull();
  });

  it('step 9: respin vote does not produce a winner restaurant', async () => {
    // Simulate a scenario where RESPIN wins the vote
    const game = (await getGame(gameId))!;
    const votes = [
      { messageTs: gameId, restaurantId: RESPIN_ID, userId: TEST_USER_ID },
      { messageTs: gameId, restaurantId: RESPIN_ID, userId: TEST_USER_2 },
    ];

    // Tally votes
    const voteCounts: Record<string, number> = {};
    for (const v of votes) {
      voteCounts[v.restaurantId] = (voteCounts[v.restaurantId] ?? 0) + 1;
    }

    const topVotedId = Object.entries(voteCounts).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];

    expect(topVotedId).toBe(RESPIN_ID);

    // RESPIN_ID should not be found in currentOptions
    const foundInOptions = game.currentOptions.find((r) => r.id === RESPIN_ID);
    expect(foundInOptions).toBeUndefined();
  });
});
