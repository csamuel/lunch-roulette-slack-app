import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import { MongoClient, Db, Collection } from "mongodb";
import qs from "qs";

// Environment variables
const YELP_API_KEY = process.env.YELP_API_KEY || "YOUR_YELP_API_KEY";
const MONGODB_URI = process.env.MONGODB_URI || "YOUR_MONGODB_URI";
const SLACK_VERIFICATION_TOKEN =
  process.env.SLACK_VERIFICATION_TOKEN || "YOUR_SLACK_VERIFICATION_TOKEN";

const MONGO_DB_NAME = "lunchroulette";
const MONGO_COLLECTION_NAME = "selectedplaces";

// MongoDB setup
let cachedDb: Db;

type Block = {
  type: "section" | "divider" | "actions" | "context" | "image";
  text?: {};
  elements?: {}[];
  accessory?: {};
};

interface SelectedPlace {
  restaurantId: string;
  lastVisited: Date;
}

interface Restaurant {
  id: string;
  name: string;
  url: string;
  image_url: string;
  distance: number;
  price: string;
  display_address: string[];
  rating: number;
  location: { display_address: string[] };
  categories: { title: string }[];
  attributes: {
    menu_url?: string;
  };
}

export default async (req: VercelRequest, res: VercelResponse) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // Parse URL-encoded body
  const body = typeof req.body === "string" ? qs.parse(req.body) : req.body;

  // Validate Slack token (optional but recommended)
  if (body.token !== SLACK_VERIFICATION_TOKEN) {
    res.status(401).send("Unauthorized");
    return;
  }

  // Get the subcommand from the text
  const subcommand = (body.text || "").trim().toLowerCase();

  // Coordinates for 211 E 7th St, Austin, TX 78701
  const LATITUDE = 30.2682;
  const LONGITUDE = -97.7404;
  const RADIUS = 1000; // in meters

  // Yelp API parameters
  const PAGE_LIMIT = 50; // Max limit per request
  const MAX_RESULTS = 200; // Adjust as needed (max 1000)

  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection<SelectedPlace>(MONGO_COLLECTION_NAME);

    if (subcommand === "reset") {
      // Handle the reset subcommand
      await collection.deleteMany({});
      res.json({
        response_type: "ephemeral",
        text: "All recently visited places have been reset.",
      });
      return;
    }

    // Create an array of offsets based on page limit and max results
    const totalOffsets = Array.from(
      { length: Math.ceil(MAX_RESULTS / PAGE_LIMIT) },
      (_, i) => i * PAGE_LIMIT,
    );

    // Fetch all pages in parallel
    const requests = totalOffsets.map((offset) =>
      axios.get("https://api.yelp.com/v3/businesses/search", {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
        },
        params: {
          term: "restaurants",
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
    const recentlyVisitedIds = await collection
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
        response_type: "ephemeral",
        text: "No new restaurants available within the past two weeks!",
      });
      return;
    }

    // Randomly select a restaurant
    const restaurant =
      filteredRestaurants[
        Math.floor(Math.random() * filteredRestaurants.length)
      ];

    // Save the selection to MongoDB
    await collection.updateOne(
      { restaurantId: restaurant.id },
      { $set: { lastVisited: new Date() } },
      { upsert: true },
    );

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Found ${filteredRestaurants.length} places near 211 E 7th St. Here's one you might like:`,
        },
      },
      {
        type: "divider",
      },
      ...toSlackBlocks(restaurant),
      {
        type: "divider",
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              emoji: true,
              text: "Pick Another Place?",
            },
            value: "click_me_123",
          },
        ],
      },
    ];

    // Respond to Slack
    res.json({
      response_type: "in_channel",
      blocks: blocks,
    });
  } catch (error) {
    console.error("Error:", error);
    res.json({
      response_type: "ephemeral",
      text: "Sorry, something went wrong while fetching restaurants.",
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

function toSlackBlocks(restaurant: Restaurant): Array<Block> {
  const {
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
  const categoryNames = categories.map((c) => c.title).join(", ");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${url}|${name}>*\n🍴 ${categoryNames}\n💰 ${price}\n📍 ${distanceInMiles} miles away\n⭐️ ${rating}\n📔 *<${menu_url}|Menu>*`,
      },
      accessory: {
        type: "image",
        image_url: image_url,
        alt_text: name,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "image",
          image_url:
            "https://api.slack.com/img/blocks/bkb_template_images/tripAgentLocationMarker.png",
          alt_text: "Location Pin Icon",
        },
        {
          type: "plain_text",
          emoji: true,
          text: `Address: ${display_address.join(", ")}`,
        },
      ],
    },
  ];
}
