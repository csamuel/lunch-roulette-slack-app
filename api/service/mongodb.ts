import { type Db, type Filter, MongoClient } from 'mongodb';

import type { Configuration, GameState } from '../types/lunchr';

const MONGODB_URI = process.env.MONGODB_URI ?? 'YOUR_MONGODB_URI';
const MONGO_DB_NAME = 'lunchroulette';
const MONGO_CONFIGURATION_COLLECTION = 'configurations';
const MONGO_GAMESTATE_COLLECTION = 'gamestates';
const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5_000;
const MONGO_CONNECT_TIMEOUT_MS = 5_000;
const MONGO_SOCKET_TIMEOUT_MS = 10_000;

let cachedDb: Db | undefined;
let cachedClientPromise: Promise<MongoClient> | undefined;

function createMongoClient(): MongoClient {
  return new MongoClient(MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: MONGO_CONNECT_TIMEOUT_MS,
    socketTimeoutMS: MONGO_SOCKET_TIMEOUT_MS,
  });
}

async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  cachedClientPromise ??= createMongoClient().connect();

  try {
    const client = await cachedClientPromise;
    cachedDb = client.db(MONGO_DB_NAME);
    return cachedDb;
  } catch (error) {
    cachedClientPromise = undefined;
    throw error;
  }
}

export async function saveConfiguration(config: {
  address: string;
  radius: number;
  minRating: number;
  maxPrice: string;
  channelId: string;
}) {
  const { address, radius, minRating, maxPrice, channelId } = config;
  const db = await connectToDatabase();
  const configurationCollection = db.collection<Configuration>(MONGO_CONFIGURATION_COLLECTION);
  await configurationCollection.updateOne(
    { channelId },
    {
      $set: {
        address,
        radius,
        minRating,
        maxPrice,
      },
    },
    { upsert: true },
  );
}

export async function getConfiguration(channelId: string): Promise<Configuration | null> {
  const db = await connectToDatabase();
  const configurationCollection = db.collection<Configuration>(MONGO_CONFIGURATION_COLLECTION);
  return await configurationCollection.findOne({
    channelId,
  });
}

export async function findActiveGame(channelId: string): Promise<GameState | null> {
  const db = await connectToDatabase();
  const gameStateCollection = db.collection<GameState>(MONGO_GAMESTATE_COLLECTION);
  return await gameStateCollection.findOne({
    'configuration.channelId': channelId,
    status: 'voting',
  } as Filter<GameState>);
}

export async function getGame(gameId: string): Promise<GameState | null> {
  const db = await connectToDatabase();
  const gameStateCollection = db.collection<GameState>(MONGO_GAMESTATE_COLLECTION);
  return await gameStateCollection.findOne({
    id: gameId,
  });
}

export async function saveGame(gameState: GameState) {
  const db = await connectToDatabase();
  const configurationCollection = db.collection<GameState>(MONGO_GAMESTATE_COLLECTION);
  await configurationCollection.updateOne({ id: gameState.id }, { $set: gameState }, { upsert: true });
}
