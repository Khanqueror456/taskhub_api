import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

/**
 * Producers (the API) should fail fast when Redis is down.
 * Workders must wait and retry forever, which BullMQ requires them to configure 
 * with maxRetriesPerRequest: null.
 */

export function bullConnection(role : 'producer' | 'worker') : ConnectionOptions {

    const url = new URL(env.REDIS_URL);
    return {
        host : url.hostname,
        port : Number(url.port || 6379),
        username : url.username || undefined,
        password : url.password ? decodeURIComponent(url.password) : undefined,
        db : url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
        ...(url.protocol === 'rediss:' ? {tls : {} } : {}),
        ...(role === 'worker' ? { maxRetriesPerRequest : null } : { enableOfflineQueue : false }),

    };
}