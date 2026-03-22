import type { VercelRequest, VercelResponse } from '@vercel/node';

import { finalize } from '../../../service/game';

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
    const { spinnerToken } = req.body as { spinnerToken: string };

    if (!spinnerToken) {
      res.status(401).json({ error: 'Missing spinnerToken' });
      return;
    }

    const { game: updatedGame, winner, error } = await finalize(gameId, spinnerToken, 'token');

    if (error) {
      const status = error === 'Game not found' ? 404 : error === 'Invalid spinner token' ? 401 : 400;
      res.status(status).json({ error });
      return;
    }

    if (!updatedGame) return;

    const { possibleOptions: _, spinnerToken: __, ...publicGame } = updatedGame;
    res.status(200).json({ game: publicGame, winner });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- serverless function error logging
    console.error('Error finalizing:', error);
    res.status(500).json({ error: 'Failed to finalize' });
  }
};
