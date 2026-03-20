import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import * as api from '../api';
import { useGamePolling } from '../hooks/useGamePolling';

import NamePrompt from './NamePrompt';
import RestaurantCard from './RestaurantCard';
import SpinnerControls from './SpinnerControls';
import WinnerBanner from './WinnerBanner';

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, error, loading, refresh } = useGamePolling(gameId);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const spinnerToken = gameId ? localStorage.getItem(`spinner:${gameId}`) : null;
  const isCreator = !!spinnerToken;

  const [voterName, setVoterName] = useState<string | null>(() => {
    return sessionStorage.getItem('voterName');
  });
  const needsName = !isCreator && !voterName && game?.status === 'voting';

  function handleNameSubmit(name: string) {
    sessionStorage.setItem('voterName', name);
    setVoterName(name);
  }

  // The display name used for voting — creator uses their spinner name
  const displayName = isCreator ? game?.spinner.displayName ?? '' : voterName ?? '';

  const votesByRestaurant = useMemo(() => {
    if (!game) return {};
    const map: Record<string, string[]> = {};
    for (const v of game.votes) {
      if (!map[v.restaurantId]) map[v.restaurantId] = [];
      map[v.restaurantId].push(v.userId);
    }
    return map;
  }, [game]);

  const currentVote = game?.votes.find((v) => v.userId === displayName)?.restaurantId;

  const handleVote = useCallback(async (restaurantId: string) => {
    if (!gameId || !displayName) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.vote(gameId, displayName, restaurantId);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, displayName, refresh]);

  const handleRespin = useCallback(async () => {
    if (!gameId || !spinnerToken) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.respinGame(gameId, spinnerToken);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Respin failed');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, spinnerToken, refresh]);

  const handleFinalize = useCallback(async () => {
    if (!gameId || !spinnerToken) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.finalizeGame(gameId, spinnerToken);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Finalize failed');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, spinnerToken, refresh]);

  // Determine winner from finalized game
  const winner = useMemo(() => {
    if (!game || game.status !== 'finalized' || game.votes.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const v of game.votes) {
      counts[v.restaurantId] = (counts[v.restaurantId] || 0) + 1;
    }
    const topId = Object.entries(counts).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
    return game.currentOptions.find((r) => r.id === topId) ?? null;
  }, [game]);

  if (loading) return <div className="loading">Loading game...</div>;
  if (error) return <div className="error-page"><h2>Error</h2><p>{error}</p></div>;
  if (!game) return <div className="error-page"><h2>Game not found</h2></div>;

  const isVoting = game.status === 'voting';
  const isFinalized = game.status === 'finalized';

  return (
    <div className="game-page">
      <h1>Lunch Roulette</h1>
      <p className="game-info">
        {game.spinner.displayName} started a game &middot; Spin #{game.spins}
      </p>
      <p className="game-meta">
        {game.currentOptions.length} options near {game.configuration.address}
      </p>

      {needsName && <NamePrompt onSubmit={handleNameSubmit} />}

      {actionError && <p className="error">{actionError}</p>}

      {isFinalized && winner && <WinnerBanner winner={winner} />}

      <div className="restaurant-list">
        {game.currentOptions.map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            voteCount={votesByRestaurant[restaurant.id]?.length ?? 0}
            voters={votesByRestaurant[restaurant.id] ?? []}
            votingEnabled={isVoting && !!displayName}
            hasVoted={currentVote === restaurant.id}
            onVote={(id) => void handleVote(id)}
          />
        ))}
      </div>

      {isVoting && isCreator && (
        <SpinnerControls
          onRespin={() => void handleRespin()}
          onFinalize={() => void handleFinalize()}
          disabled={actionLoading}
        />
      )}

      {isFinalized && (
        <p className="finalized-note">Voting has ended.</p>
      )}

      {!isCreator && gameId && (
        <p className="share-hint">
          Share this page to let others vote!
        </p>
      )}
    </div>
  );
}
