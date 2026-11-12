import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'], // <-- must be here
    env: {
      RATE_LIMIT_ENABLED: 'false',
      REDIS_URL: 'redis://localhost:6379/1',
      JOB_BACKOFF_MS: '10',
    },
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false,
  },
});