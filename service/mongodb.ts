import { Db, MongoClient } from 'mongodb';
import { Vote } from '../types/lunchr';

const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI';
const MONGO_DB_NAME = 'lunchroulette';
const MONGO_SELECTED_PLACES_COLLECTION = 'selectedplaces';
const MONGO_CONFIGURATION_COLLECTION = 'configurations';
const MONGO_VOTES_COLLECTION = 'votes';

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

export async function recordVote(
  userId: string,
  messageTs: string,
  restaurantId: string,
) {
  const db = await connectToDatabase();
  const votesCollection = db.collection<Vote>(MONGO_VOTES_COLLECTION);

  await votesCollection.updateOne(
    { userId: userId, messageTs: messageTs },
    { $set: { restaurantId: restaurantId } },
    { upsert: true },
  );
}

export async function getVotes(messageTs: string): Promise<Vote[]> {
  const db = await connectToDatabase();
  const votesCollection = db.collection<Vote>(MONGO_VOTES_COLLECTION);

  return votesCollection.find({ messageTs: messageTs }).toArray();
}
