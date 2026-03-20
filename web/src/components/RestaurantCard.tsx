import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
  voteCount: number;
  voters: string[];
  votingEnabled: boolean;
  hasVoted: boolean;
  onVote: (restaurantId: string) => void;
}

const MILES_PER_METER = 0.000621371;

export default function RestaurantCard({
  restaurant,
  voteCount,
  voters,
  votingEnabled,
  hasVoted,
  onVote,
}: Props) {
  const {
    id,
    name,
    url,
    image_url,
    rating,
    price,
    distance,
    categories,
    location: { display_address },
    attributes,
  } = restaurant;

  const distanceInMiles = distance ? (distance * MILES_PER_METER).toFixed(2) : null;
  const categoryNames = categories.map((c) => c.title).join(', ');

  return (
    <div className={`restaurant-card${hasVoted ? ' voted' : ''}`}>
      <div className="restaurant-header">
        <div className="restaurant-info">
          <h3>
            <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
          </h3>
          {categoryNames && <p className="categories">{categoryNames}</p>}
          {attributes?.menu_url && (
            <a href={attributes.menu_url} target="_blank" rel="noopener noreferrer" className="menu-link">
              View menu
            </a>
          )}
        </div>
        {image_url && (
          <img
            src={image_url}
            alt={name}
            className="restaurant-image"
          />
        )}
      </div>

      <div className="restaurant-meta">
        <span>{'*'.repeat(Math.round(rating))} {rating.toFixed(1)}</span>
        <span>{price || '?'}</span>
        <span>{display_address.join(', ')}{distanceInMiles ? ` (${distanceInMiles} mi)` : ''}</span>
      </div>

      <div className="restaurant-votes">
        <span>Votes: {voteCount}</span>
        {voters.length > 0 && <span className="voter-names">{voters.join(', ')}</span>}
      </div>

      {votingEnabled && (
        <button
          className={`btn-vote${hasVoted ? ' selected' : ''}`}
          onClick={() => onVote(id)}
        >
          {hasVoted ? 'Selected' : 'Vote'}
        </button>
      )}
    </div>
  );
}
