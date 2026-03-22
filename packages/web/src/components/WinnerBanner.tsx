import type { Restaurant } from '../types';

interface Props {
  winner: Restaurant;
}

export default function WinnerBanner({ winner }: Props) {
  return (
    <div className="winner-banner">
      <h2>The winner is...</h2>
      <div className="winner-card">
        {winner.image_url && (
          <img src={winner.image_url} alt={winner.name} className="winner-image" />
        )}
        <h3>
          <a href={winner.url} target="_blank" rel="noopener noreferrer">{winner.name}</a>
        </h3>
        <p>{winner.categories.map((c) => c.title).join(', ')}</p>
        <p className="winner-address">{winner.location.display_address.join(', ')}</p>
      </div>
    </div>
  );
}
