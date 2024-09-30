import { Db, MongoClient } from 'mongodb';
import { Configuration, GameState, SelectedPlace, Vote } from '../types/lunchr';
import { Restaurant } from '../types/yelp';

const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI';
const MONGO_DB_NAME = 'lunchroulette';
const MONGO_CONFIGURATION_COLLECTION = 'configurations';
const MONGO_GAMESTATE_COLLECTION = 'gamestates';

let cachedDb: Db;

async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db(MONGO_DB_NAME);
  return cachedDb;
}

export async function saveConfiguration(
  address: string,
  radius: number,
  minRating: number,
  channelId: string,
) {
  const db = await connectToDatabase();
  const configurationCollection = db.collection<Configuration>(
    MONGO_CONFIGURATION_COLLECTION,
  );
  await configurationCollection.updateOne(
    { channelId: channelId },
    { $set: { address: address, radius: radius, minRating: minRating } },
    { upsert: true },
  );
}

export async function getConfiguration(
  channelId: string,
): Promise<Configuration | null> {
  const db = await connectToDatabase();
  const configurationCollection = db.collection<Configuration>(
    MONGO_CONFIGURATION_COLLECTION,
  );
  return configurationCollection.findOne({
    channelId: channelId,
  });
}

export async function findActiveGame(
  channelId: string,
): Promise<GameState | null> {
  const db = await connectToDatabase();
  const gameStateCollection = db.collection<GameState>(
    MONGO_GAMESTATE_COLLECTION,
  );
  return gameStateCollection.findOne({
    'configuration.channelId': channelId,
    status: 'voting',
  });
}

export async function getGame(gameId: string): Promise<GameState | null> {
  const db = await connectToDatabase();
  const gameStateCollection = db.collection<GameState>(
    MONGO_GAMESTATE_COLLECTION,
  );
  return gameStateCollection.findOne({
    id: gameId,
  });
}

export async function saveGame(gameState: GameState) {
  const db = await connectToDatabase();
  const configurationCollection = db.collection<GameState>(
    MONGO_GAMESTATE_COLLECTION,
  );
  await configurationCollection.updateOne(
    { id: gameState.id },
    { $set: gameState },
    { upsert: true },
  );
}
