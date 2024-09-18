import { Db, MongoClient } from 'mongodb';
import { SelectedPlace, Vote } from '../types/lunchr';
import { Restaurant } from '../types/yelp';

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

export async function saveConfiguration(address: string, radius: number) {
  const db = await connectToDatabase();
  const configurationCollection = db.collection(MONGO_CONFIGURATION_COLLECTION);
  await configurationCollection.updateOne(
    { gameId: 1 },
    { $set: { address: address, radius: radius } },
    { upsert: true },
  );
}

export async function getConfiguration() {
  const db = await connectToDatabase();
  const configurationCollection = db.collection(MONGO_CONFIGURATION_COLLECTION);
  return configurationCollection.findOne({});
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

export async function saveSelectedPlaces(
  selectedRestaurants: Restaurant[],
  messageTs: string,
) {
  const db = await connectToDatabase();

  const selectedPlaceCollection = db.collection<SelectedPlace>(
    MONGO_SELECTED_PLACES_COLLECTION,
  );

  await Promise.all(
    selectedRestaurants.map((restaurant) =>
      selectedPlaceCollection.updateOne(
        { restaurantId: restaurant.id, messageTs: messageTs },
        { $set: { lastVisited: new Date() } },
        { upsert: true },
      ),
    ),
  );
}

export async function getSelectedPlaces(): Promise<string[]> {
  const db = await connectToDatabase();
  const selectedPlaceCollection = db.collection<SelectedPlace>(
    MONGO_SELECTED_PLACES_COLLECTION,
  );

  // Fetch restaurant IDs visited in the last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentlyVisitedIds = await selectedPlaceCollection
    .find({ lastVisited: { $gte: twoWeeksAgo } })
    .map((doc) => doc.restaurantId)
    .toArray();

  return recentlyVisitedIds;
}

export async function resetSelectedPlaces(): Promise<void> {
  const db = await connectToDatabase();
  const selectedPlaceCollection = db.collection<SelectedPlace>(
    MONGO_SELECTED_PLACES_COLLECTION,
  );
  await selectedPlaceCollection.deleteMany({});
}
