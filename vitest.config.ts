import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      RATE_LIMIT_ENABLED: 'false',
      REDIS_URL: 'redis://localhost:6379/1', // tests use Redis database 1, never your dev data
      JOB_BACKOFF_MS: '10', // fast retries
    },
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false, // test files share one queue and one worker pool
  },
});