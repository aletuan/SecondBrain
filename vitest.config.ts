import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['reader/tests/**/*.test.ts'],
  },
});
