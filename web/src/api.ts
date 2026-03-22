import type { GameState, Restaurant } from './types';

const BASE = '/api/web';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- res.json returns unknown
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- res.json returns unknown
  return await (res.json() as Promise<T>);
}

export async function createGame(body: {
  spinnerName: string;
  address: string;
  radius: number;
  minRating: number;
  maxPrice: string;
}) {
  return await request<{ gameId: string; spinnerToken: string; game: GameState }>(
    '/games',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function getGame(gameId: string) {
  return await request<GameState>(`/game/${gameId}`);
}

export async function vote(gameId: string, voterName: string, restaurantId: string) {
  return await request<GameState>(`/game/${gameId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ voterName, restaurantId }),
  });
}

export async function respinGame(gameId: string, spinnerToken: string) {
  return await request<GameState>(`/game/${gameId}/respin`, {
    method: 'POST',
    body: JSON.stringify({ spinnerToken }),
  });
}

export async function finalizeGame(gameId: string, spinnerToken: string) {
  return await request<{ game: GameState; winner: Restaurant }>(`/game/${gameId}/finalize`, {
    method: 'POST',
    body: JSON.stringify({ spinnerToken }),
  });
}
