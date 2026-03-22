import { useCallback, useState } from 'react';

import type { SearchConfig } from '../types';

const STORAGE_KEY = 'lunchRoulette:config';

const defaults: SearchConfig = {
  address: '',
  radius: 1000,
  minRating: 3.0,
  maxPrice: '$$$',
};

function load(): SearchConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
    if (stored) return { ...defaults, ...JSON.parse(stored) as Partial<SearchConfig> };
  } catch { /* ignore */ }
  return defaults;
}

export function useLocalConfig() {
  const [config, setConfigState] = useState<SearchConfig>(load);

  const setConfig = useCallback((update: Partial<SearchConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...update };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { config, setConfig };
}
