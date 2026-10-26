import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';


export const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest : 1, // don't let a request wait through endless retries
    commandTimeout : 500, // giv up on a command after 500 ms
});

// Without a listener, connection errors would sruface as unhandled event
redis.on('error', (err) => logger.error({ err }, 'Redis error'));