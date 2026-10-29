import { afterAll } from "vitest";
import { redis } from '../src/lib/redis.js';

afterAll(async () => {
    await redis.quit().catch(() => undefined);
});