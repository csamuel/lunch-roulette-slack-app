# Lunch Roulette
![lunchr-logo](https://github.com/user-attachments/assets/f2cf34ac-6f3f-4e5b-a20d-0dac11a73603) 

**Lunch Roulette** is a Slack app that randomly selects 3 nearby restaurants for lunch and allows channel members to vote for their preferred option. A winner is declared when the user that initiated the lunch roulette chooses to "finalize" (end) the game.

## Quick Start

### Prerequisites

- **Node.js** (v20+)
- **pnpm**
- **Vercel account**
- **Slack Workspace** (and permission to install apps)
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

1. Add the Lunch Roulette app to a slack channel.
2. In Slack, type `/lunchr configure` to configure the location, distance, cost, etc.
3. Type `/lunchr` to start a new lunch roulette.


## License

This project is licensed under the MIT License.

---

**Enjoy your lunch with Lunch Roulette!**
