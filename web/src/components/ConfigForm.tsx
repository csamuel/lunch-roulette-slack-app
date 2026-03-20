import type { SearchConfig } from '../types';

interface Props {
  config: SearchConfig;
  onChange: (update: Partial<SearchConfig>) => void;
}

export default function ConfigForm({ config, onChange }: Props) {
  return (
    <div className="config-form">
      <label>
        Address
        <input
          type="text"
          value={config.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="123 Main St, City, State"
        />
      </label>
      <label>
        Radius (meters)
        <input
          type="number"
          value={config.radius}
          onChange={(e) => onChange({ radius: parseInt(e.target.value) || 0 })}
        />
      </label>
      <label>
        Minimum Rating (0-5)
        <input
          type="number"
          step="0.1"
          min="0"
          max="5"
          value={config.minRating}
          onChange={(e) => onChange({ minRating: parseFloat(e.target.value) || 0 })}
        />
      </label>
      <label>
        Max Price
        <select
          value={config.maxPrice}
          onChange={(e) => onChange({ maxPrice: e.target.value })}
        >
          <option value="$">$</option>
          <option value="$$">$$</option>
          <option value="$$$">$$$</option>
          <option value="$$$$">$$$$</option>
        </select>
      </label>
    </div>
  );
}
