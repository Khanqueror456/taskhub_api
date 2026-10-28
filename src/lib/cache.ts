import { logger } from "../config/logger.js";
import { redis } from "./redis.js";

// Every helper swallows Redis errors: a broken cache must never break a request

export async function cacheGet<T>(key : string) : Promise<T | null> {

    try {

        const raw = await redis.get(key);
        return raw === null ? null : (JSON.parse(raw) as T);
        
    } catch (err) {
        logger.warn({ err, key }, 'Cache read failed');
        return null;
    }
}

export async function cacheSet(key : string, value : unknown, ttlSeconds : number) : Promise<void> {

    try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        
    } catch (err) {
        logger.warn({ err, key }, 'Cache write failed');
    }
}

export async function cacheDel(...keys : string[]) : Promise<void> {

    if (keys.length === 0) return;
    
    try {

        await redis.del(...keys);
        
    } catch (err) {
        
        logger.warn({ err, keys }, 'Cache delete failed');
    }
}


// Cache-aside: return the cached value, or load it, cache it, and return it. Never caches null

export async function cached<T>(
    key : string,
    ttlSeconds : number,
    load : () => Promise<T | null>,
    ) : Promise<T | null> {

        const hit = await cacheGet<T>(key);

        if (hit !== null) return hit;


        const fresh = await load();
        
        if (fresh !== null) await cacheSet(key, fresh, ttlSeconds);
        return fresh;
    }

    