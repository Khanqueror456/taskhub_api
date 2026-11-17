import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './tests/testEnv';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: {
      DATABASE_URL: TEST_DATABASE_URL, // the app under test talks to the TEST database
      REDIS_URL: TEST_REDIS_URL,
      RATE_LIMIT_ENABLED: 'false',
      JOB_BACKOFF_MS: '10',
    },
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false, // files share one database, one queue and one Redis
    testTimeout: 20_000, // argon2 and real I/O are slower than unit tests
    hookTimeout: 30_000,
  },
});