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

    // Fetch restaurants from Yelp
    const yelpResponse = await axios.get(
      "https://api.yelp.com/v3/businesses/search",
      {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
        },
        params: {
          term: "restaurants",
          latitude: LATITUDE,
          longitude: LONGITUDE,
          radius: RADIUS,
          limit: 50,
        },
      },
    );

    let restaurants = yelpResponse.data.businesses;

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
    } = restaurant;

    const distanceInMiles = (distance * 0.000621371192).toFixed(2);

    // Save the selection to MongoDB
    await collection.updateOne(
      { restaurantId: id },
      { $set: { lastVisited: new Date() } },
      { upsert: true },
    );

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `We found ${restaurants.length} places to eat near 211 E 7th St. Here's one you might like:`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${url}|${name}>*\n★★★★★\n${price}\nDistance: ${distanceInMiles} miles \nRating: ${rating}`,
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
      // text: `How about *${restaurant.name}*?\n${restaurant.location.address1}, ${restaurant.location.city}\n<${restaurant.url}|View on Yelp>`,
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
