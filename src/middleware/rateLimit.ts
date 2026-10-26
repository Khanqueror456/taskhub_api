import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';
import { AppError } from '../utils/AppError.js';

// Count this hit and guarantee the key has an expiry, in one atomic step

const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { current, redis.call('TTL', KEYS[1])}
`;

export interface RateLimitOptions {
    name : string; // namespace in Redis, e.g. "login-email"
    limit : number; // max requests per window
    windowSeconds : number;
    key : (req : Request) => string | undefined; // who is being limited; undefined = skip
    enabled? : boolean; // defaults to the RATE_LIMIT_ENABLED env var
}

export function rateLimit(opts : RateLimitOptions) : RequestHandler {
    return async (req, res, next) => {

        if (!(opts.enabled ?? env.RATE_LIMIT_ENABLED)) return next();

        const id = opts.key(req);
        if (!id) return next();

        const result = await redis
        .eval(SCRIPT, 1, `r1:${opts.name}:${id}`, opts.windowSeconds)
        .then((r) => r as [number, number])
        .catch((err : unknown) => {
            req.log.warn({ err }, "Rate limited unavailable, allowing request");
            return null;
        });

        if (!result) return next(); // fail open

        const [count, ttl] = result;
        res.setHeader("RateLimit-Limit", opts.limit);
        res.setHeader("RateLimit-Remaining", Math.max(0, opts.limit - count));
        res.setHeader("RateLimit-Reset", Math.max(ttl, 0));

        if (count > opts.limit) {
            res.setHeader("Retry-After", Math.max(ttl, 1));
            return next(AppError.tooManyRequests());
        }

        next();
    };
}