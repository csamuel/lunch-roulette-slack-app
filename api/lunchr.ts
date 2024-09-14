import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import { MongoClient, Db, Collection } from "mongodb";
import qs from "qs";

// Environment variables
const YELP_API_KEY = process.env.YELP_API_KEY || "YOUR_YELP_API_KEY";
const MONGODB_URI = process.env.MONGODB_URI || "YOUR_MONGODB_URI";

// MongoDB setup
let cachedDb: Db;

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
  const SLACK_VERIFICATION_TOKEN =
    process.env.SLACK_VERIFICATION_TOKEN || "YOUR_SLACK_VERIFICATION_TOKEN";
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
  const LIMIT = 50; // Max limit per request
  const MAX_RESULTS = 200; // Adjust as needed (max 1000)
  const offsets = [];
  for (let offset = 0; offset < MAX_RESULTS; offset += LIMIT) {
    offsets.push(offset);
  }

  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection<SelectedPlace>("selectedplaces");

    if (subcommand === "reset") {
      // Handle the reset subcommand
      await collection.deleteMany({});
      res.json({
        response_type: "ephemeral",
        text: "All recently visited places have been reset.",
      });
      return;
    }

    const totalResults = 200;

    const totalOffsets = [];
    for (
      let offset = 0;
      offset < totalResults && offset < MAX_RESULTS;
      offset += LIMIT
    ) {
      totalOffsets.push(offset);
    }

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
          limit: LIMIT,
          offset: offset,
        },
      }),
    );

    // Wait for all requests to complete
    const responses = await Promise.all(requests);

    // Aggregate all businesses
    let restaurants: Restaurant[] = [];
    responses.forEach((response) => {
      restaurants = restaurants.concat(response.data.businesses);
    });

    console.log("total results:", restaurants.length);

    // Fetch restaurant IDs visited in the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentlyVisitedIds = await collection
      .find({ lastVisited: { $gte: twoWeeksAgo } })
      .map((doc) => doc.restaurantId)
      .toArray();

    // Filter out recently visited restaurants
    restaurants = restaurants.filter(
      (restaurant: { id: string }) =>
        !recentlyVisitedIds.includes(restaurant.id),
    );

    if (restaurants.length === 0) {
      res.json({
        response_type: "ephemeral",
        text: "No new restaurants available within the past two weeks!",
      });
      return;
    }

    // Randomly select a restaurant
    const restaurant =
      restaurants[Math.floor(Math.random() * restaurants.length)];

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
          text: `Found ${restaurants.length} places to eat near 211 E 7th St. Here's one you might like:`,
        },
      },
      {
        type: "divider",
      },
      ...getRestaurantBlocks(restaurant),
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
  cachedDb = client.db("lunchroulette");
  return cachedDb;
}

function getRestaurantBlocks(restaurant: Restaurant): Array<any> {
  const {
    name,
    url,
    image_url,
    rating,
    price,
    distance,
    categories,
    location: { display_address },
  } = restaurant;

  const distanceInMiles = (distance * 0.000621371192).toFixed(2);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${url}|${name}>*\nCategory: ${categories.map((c) => c.title).join(", ")}\nPrice: ${price}\nDistance: ${distanceInMiles} miles \nRating: ${rating}`,
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
          text: `Location: ${display_address.join(", ")}`,
        },
      ],
    },
  ];
}
