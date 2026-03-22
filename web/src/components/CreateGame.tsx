import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createGame } from '../api';
import { useLocalConfig } from '../hooks/useLocalConfig';

import ConfigForm from './ConfigForm';

export default function CreateGame() {
  const { config, setConfig } = useLocalConfig();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleCreate() {
    if (!name.trim() || !config.address.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const { gameId, spinnerToken } = await createGame({
        spinnerName: name.trim(),
        ...config,
      });

      localStorage.setItem(`spinner:${gameId}`, spinnerToken);
      void navigate(`/game/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="create-page">
      <h1>Lunch Roulette</h1>
      <p>Configure your search, enter your name, and spin the wheel!</p>

      <ConfigForm config={config} onChange={setConfig} />

      <div className="name-section">
        <label>
          Your Name
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="Enter your display name"
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <button
        className="btn-primary"
        onClick={() => { void handleCreate(); }}
        disabled={creating || !name.trim() || !config.address.trim()}
      >
        {creating ? 'Creating...' : 'New Game'}
      </button>
    </div>
  );
}
