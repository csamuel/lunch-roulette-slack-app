import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/__integration__/**/*.test.ts'],
    setupFiles: ['./test-setup.ts'],
  },
});
