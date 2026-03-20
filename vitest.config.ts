import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/__integration__/**', '**/public/**'],
  },
});
