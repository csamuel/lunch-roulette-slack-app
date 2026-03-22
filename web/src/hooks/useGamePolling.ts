import { useCallback, useEffect, useRef, useState } from 'react';

import { getGame } from '../api';
import type { GameState } from '../types';

export function useGamePolling(gameId: string | undefined) {
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await getGame(gameId);
      setGame(data);
      setError(null);

      // Stop polling when finalized
      if (data.status === 'finalized' && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    void fetchGame();
    intervalRef.current = setInterval(() => { void fetchGame(); }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [gameId, fetchGame]);

  // Allow manual refresh after actions
  const refresh = useCallback(() => { void fetchGame(); }, [fetchGame]);

  return { game, error, loading, refresh, setGame };
}
