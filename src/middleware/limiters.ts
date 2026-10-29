import { createHash } from "node:crypto";
import { rateLimit } from "./rateLimit.js";
import type { Request } from 'express';

const FIFTEEN_MINUTES = 15 * 60;
const sha256 = (value : string) => createHash('sha256').update(value).digest('hex');

export const authIpLimiter = rateLimit({
    name : "auth-ip",
    limit : 20,
    windowSeconds : FIFTEEN_MINUTES,
    key : (req) => req.ip,
});

export const refreshIpLimiter = rateLimit({
    name : "refresh-ip",
    limit : 120,
    windowSeconds : FIFTEEN_MINUTES,
    key : (req) => req.ip
});


// Hash the email so addresses never sit in Redis keys, Runs after `validate`,
// so the email is already trimmed and lowercased.

export const loginEmailLimiter = rateLimit({
    name : "login-email",
    limit : 10,
    windowSeconds : FIFTEEN_MINUTES,
    key : (req) => (typeof req.body?.email === "string" ? sha256(req.body.email) : undefined),
});

// Runs after `authenticate`, so req.user is set
export const apiLimiter = rateLimit({
    name : "api-user",
    limit : 120,
    windowSeconds : 60,
    key : (req) => req.user?.id,
});

// Runs after authorize
export const orgKey = (req: Request) => req.membership?.organizationId;

export const orgLimiter = rateLimit({
    name : "api-org",
    limit : 120,
    windowSeconds : 60,
    key: orgKey,
});