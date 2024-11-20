# Lunch Roulette
![lunchr-logo](https://github.com/user-attachments/assets/f2cf34ac-6f3f-4e5b-a20d-0dac11a73603) 

**Lunch Roulette** is a Slack app that randomly selects 3 nearby restaurants for lunch.

---


## Features

- **Random Restaurant Selection**: Picks a lunch spot within walking distance suitable for a 1-hour lunch.
- **No Recent Repeats**: Avoids suggesting places visited in the last two weeks.
- **Slack Integration**: Accessible via the `/lunchr` slash command.
- **Yelp Integration**: Fetches restaurant data from the Yelp API.
- **Cloud Deployment**: Deployed on Vercel with serverless functions.
- **Persistent Storage**: Uses MongoDB Atlas for data storage.

---

## Quick Start

### Prerequisites

- **Node.js** (v20+)
- **pnpm**
- **Vercel CLI**
- **Slack Workspace**
- **Yelp API Key**
- **MongoDB Atlas Account**

### Installation

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/csamuel/lunch-roulette-slack-app.git
   cd lunch-roulette
   ```

2. **Install Dependencies**:

   ```bash
   pnpm install
   ```

3. **Set Up Environment Variables**:

   Create a `.env` file and add:

   ```dotenv
   YELP_API_KEY=your_yelp_api_key
   MONGODB_URI=your_mongodb_connection_string
   SLACK_VERIFICATION_TOKEN=your_slack_verification_token
   SLACK_BOT_TOKEN=your_slack_bot_token
   ```

---

## Running Locally

1. **Start the Development Server**:

   ```bash
   pnpm start
   ```

2. **Test the Endpoint**:

   Use `curl` to send a POST request to `http://localhost:3000/api/slack/lunchr`.

---

## Deploying to Vercel

1. **Install Vercel CLI**:

   ```bash
   npm install -g vercel
   ```

2. **Deploy the App**:

   ```bash
   pnpm run deploy
   ```

3. **Set Environment Variables** on Vercel:

   - `YELP_API_KEY`
   - `MONGODB_URI`
   - `SLACK_VERIFICATION_TOKEN`

---

## Setting Up Slack

1. **Create a Slack App** at [Slack API Apps](https://api.slack.com/apps).
2. **Configure the `/lunchr` Slash Command** with your Vercel endpoint.
3. **Install the App** to your workspace.

---

## Usage

In Slack, type `/lunchr` to get a lunch suggestion.


## License

This project is licensed under the MIT License.

---

**Enjoy your lunch with Lunch Roulette!**
