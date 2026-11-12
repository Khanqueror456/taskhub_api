import { afterAll } from "vitest";
import { redis } from '../src/lib/redis.js';
import { emailQueue, maintenanceQueue } from '../src/jobs/queues.js';

afterAll(async () => {
    await Promise.allSettled([emailQueue.close(), maintenanceQueue.close(), redis.quit()]);
});