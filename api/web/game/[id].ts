import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getGame } from '../../service/mongodb';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const gameId = req.query.id;

    if (typeof gameId !== 'string') {
      res.status(400).json({ error: 'Invalid game ID' });
      return;
    }

    const game = await getGame(gameId);

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Strip sensitive/internal fields
    const { possibleOptions: _, spinnerToken: __, ...publicGame } = game;

    res.status(200).json(publicGame);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
};
