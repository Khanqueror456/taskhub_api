import { Redis } from 'ioredis';

// Keep in sync with vitest.config.ts. Never point this at database 0.
const TEST_REDIS_URL = 'redis://localhost:6379/1';

export default async function setup() {
    const redis = new Redis(TEST_REDIS_URL);
    await redis.flushdb();
    await redis.quit();
}