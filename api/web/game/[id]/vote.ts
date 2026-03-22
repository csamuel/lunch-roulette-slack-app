import type { VercelRequest, VercelResponse } from '@vercel/node';

import { addVote } from '../../../service/game';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const gameId = req.query.id;

    if (typeof gameId !== 'string') {
      res.status(400).json({ error: 'Invalid game ID' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- parsing request body
    const { voterName, restaurantId } = req.body as {
      voterName: string;
      restaurantId: string;
    };

    if (!voterName || !restaurantId) {
      res.status(400).json({ error: 'Missing voterName or restaurantId' });
      return;
    }

    const updatedGame = await addVote(gameId, voterName, restaurantId);

    if (!updatedGame) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const { possibleOptions: _, spinnerToken: __, ...publicGame } = updatedGame;
    res.status(200).json(publicGame);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
};
