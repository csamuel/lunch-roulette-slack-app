import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Load previously selected places
interface SelectedPlaces {
  [key: string]: string;
}

let selectedPlaces: SelectedPlaces = {};
const dataFilePath = path.join(__dirname, "selected_places.json");

try {
  if (fs.existsSync(dataFilePath)) {
    selectedPlaces = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
  }
} catch (err) {
  console.error("Error reading selected places:", err);
  selectedPlaces = {};
}

// Replace with your actual data
const LATITUDE = 30.2672; // Office latitude
const LONGITUDE = -97.7431; // Office longitude
const RADIUS = 1000; // in meters

// const YELP_API_KEY = process.env.YELP_API_KEY || "YOUR_YELP_API_KEY";

const YELP_API_KEY =
  "cjADwaJuOwPL0DDrwxu9E5lagebxqbfNqXshZTg36dQespRFhUIRPQDRRT7NtgQ0dB2L5cNNOLi6Db6PHOdDwIqE50o2SqhVno84NpA5-O6OoZAzlEjOxcHtbrLlZnYx";

app.post("/lunchr", async (req: Request, res: Response) => {
  // Fetch nearby restaurants from Yelp
  try {
    interface Restaurant {
      id: string;
      name: string;
      url: string;
      location: {
        address1: string;
        city: string;
      };
    }

    interface YelpResponse {
      businesses: Restaurant[];
    }

    const yelpResponse = await axios.get<YelpResponse>(
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

    // Filter out restaurants visited in the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    restaurants = restaurants.filter((restaurant) => {
      const lastVisited = selectedPlaces[restaurant.id];
      return !lastVisited || new Date(lastVisited) < twoWeeksAgo;
    });

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

    // Save the selection
    selectedPlaces[restaurant.id] = new Date().toISOString();
    fs.writeFileSync(dataFilePath, JSON.stringify(selectedPlaces));

    // Respond to Slack
    res.json({
      response_type: "in_channel",
      text: `How about *${restaurant.name}*?\n${restaurant.location.address1}, ${restaurant.location.city}\n<${restaurant.url}|View on Yelp>`,
    });
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    res.json({
      response_type: "ephemeral",
      text: "Sorry, something went wrong while fetching restaurants.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
