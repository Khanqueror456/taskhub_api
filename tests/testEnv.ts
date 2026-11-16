// Both vitest configs and globalSetup import this file.
// CI can override these through environment variables.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://taskhub:taskhub@localhost:5432/taskhub_test';

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';