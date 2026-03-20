import type { VercelRequest, VercelResponse } from '@vercel/node';

import { createGame, generateGameId, generateSpinnerToken } from '../service/game';
import { saveGame } from '../service/mongodb';
import type { Configuration } from '../types/lunchr';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- parsing request body
    const { spinnerName, address, radius, minRating, maxPrice } = req.body as {
      spinnerName: string;
      address: string;
      radius: number;
      minRating: number;
      maxPrice: string;
    };

    if (!spinnerName || !address || !radius || !maxPrice) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const gameId = generateGameId();
    const spinnerToken = generateSpinnerToken();

    const config: Configuration = {
      address,
      radius,
      minRating: minRating || 3.0,
      maxPrice,
    };

    const { game } = await createGame(
      { id: gameId, displayName: spinnerName },
      config,
      { source: 'web', spinnerToken },
    );

    const savedGame = { ...game, id: gameId };
    await saveGame(savedGame);

    // Return game without possibleOptions or spinnerToken
    const { possibleOptions: _, spinnerToken: __, ...publicGame } = savedGame;

    res.status(200).json({ gameId, spinnerToken, game: publicGame });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
};
