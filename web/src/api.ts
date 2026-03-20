import type { GameState, Restaurant } from './types';

const BASE = '/api/web';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createGame(body: {
  spinnerName: string;
  address: string;
  radius: number;
  minRating: number;
  maxPrice: string;
}) {
  return request<{ gameId: string; spinnerToken: string; game: GameState }>(
    '/games',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function getGame(gameId: string) {
  return request<GameState>(`/game/${gameId}`);
}

export function vote(gameId: string, voterName: string, restaurantId: string) {
  return request<GameState>(`/game/${gameId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ voterName, restaurantId }),
  });
}

export function respinGame(gameId: string, spinnerToken: string) {
  return request<GameState>(`/game/${gameId}/respin`, {
    method: 'POST',
    body: JSON.stringify({ spinnerToken }),
  });
}

export function finalizeGame(gameId: string, spinnerToken: string) {
  return request<{ game: GameState; winner: Restaurant }>(`/game/${gameId}/finalize`, {
    method: 'POST',
    body: JSON.stringify({ spinnerToken }),
  });
}
