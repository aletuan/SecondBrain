import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['cli/tests/**/*.test.ts', 'reader/tests/**/*.test.ts'],
  },
});
