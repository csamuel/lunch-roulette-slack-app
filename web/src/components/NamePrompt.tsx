import { useState } from 'react';

interface Props {
  onSubmit: (name: string) => void;
}

export default function NamePrompt({ onSubmit }: Props) {
  const [name, setName] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  }

  return (
    <div className="name-prompt-overlay">
      <form className="name-prompt" onSubmit={handleSubmit}>
        <h2>Join this game</h2>
        <p>Enter your name to vote on restaurants.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </div>
  );
}
