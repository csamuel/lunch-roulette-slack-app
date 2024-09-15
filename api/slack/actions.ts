// File: api/slack/actions.ts

import { VercelRequest, VercelResponse } from "@vercel/node";
import { MongoClient, Db } from "mongodb";
import axios from "axios";
import crypto from "crypto";
import getRawBody from "raw-body";
import qs from "qs";

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || "YOUR_MONGODB_URI";
const SLACK_SIGNING_SECRET =
  process.env.SLACK_SIGNING_SECRET || "YOUR_SLACK_SIGNING_SECRET";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "YOUR_SLACK_BOT_TOKEN";

const MONGO_DB_NAME = "lunchroulette";
const MONGO_VOTES_COLLECTION = "votes";

// Disable automatic body parsing to capture raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// MongoDB setup
let cachedDb: Db;

interface Vote {
  messageTs: string;
  restaurantId: string;
  userId: string;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Capture raw body
    const rawBody = await getRawBody(req);

    // Verify Slack request signature
    if (!isValidSlackRequest(req, rawBody)) {
      res.status(401).send("Unauthorized");
      return;
    }

    // Parse the payload
    const bodyString = rawBody.toString();
    const body = qs.parse(bodyString);
    const payload = JSON.parse(body.payload as string);

    // Extract necessary information
    const userId = payload.user.id;
    const action = payload.actions[0];
    const restaurantId = action.value;
    const messageTs = payload.message.ts;
    const channelId = payload.channel.id;

    // Connect to MongoDB
    const db = await connectToDatabase();
    const votesCollection = db.collection<Vote>(MONGO_VOTES_COLLECTION);

    // Record the vote
    await votesCollection.updateOne(
      { userId: userId, messageTs: messageTs },
      { $set: { restaurantId: restaurantId } },
      { upsert: true },
    );

    // Get all votes for this message
    const votes = await votesCollection
      .find({ messageTs: messageTs })
      .toArray();

    // Count votes per restaurant
    const voteCounts = votes.reduce(
      (acc, vote) => {
        acc[vote.restaurantId] = (acc[vote.restaurantId] || 0) + 1;
        return acc;
      },
      {} as { [key: string]: number },
    );

    // Update the original message with the vote counts
    const originalBlocks = payload.message.blocks as any[];

    const updatedBlocks = updateBlocksWithVotes(originalBlocks, voteCounts);

    // Use Slack API to update the message
    await axios.post(
      "https://slack.com/api/chat.update",
      {
        channel: channelId,
        ts: messageTs,
        blocks: updatedBlocks,
        text: payload.message.text,
      },
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Respond to Slack (empty 200 response to acknowledge)
    res.status(200).send("");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
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

// Function to verify Slack request signature
function isValidSlackRequest(req: VercelRequest, rawBody: Buffer): boolean {
  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const body = rawBody.toString();

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBasestring, "utf8")
      .digest("hex");

  const slackSignature = req.headers["x-slack-signature"] as string;

  if (!slackSignature || !mySignature) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature),
  );
}

// Function to update blocks with vote counts
function updateBlocksWithVotes(
  blocks: any[],
  voteCounts: { [key: string]: number },
): any[] {
  return blocks.map((block) => {
    console.log(JSON.stringify(block));
    console.log(JSON.stringify(voteCounts));
    if (
      block.type === "section" &&
      block.accessory &&
      block.accessory.alt_text
    ) {
      const restaurantId = block.accessory.alt_text;
      const voteCount = voteCounts[restaurantId] || 0;
      const voteText = `\n*Votes: ${voteCount}*`;

      // Avoid duplicating vote counts
      if (!block.text.text.includes("Votes:")) {
        block.text.text += voteText;
      } else {
        block.text.text = block.text.text.replace(/(\*Votes:.*\*)/, voteText);
      }
    }
    return block;
  });
}
