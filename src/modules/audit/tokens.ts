import { createHmac, randomBytes} from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';


export function signAccessToken(userId: string) : string {

    return jwt.sign({}, env.JWT_ACCESS_SECRET, {
        subject : userId,
        algorithm: 'HS256',
        expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    });
}

// Throws if the token is invalid or expired

export function verfiyAccessToken(token: string) : string {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {algorithms : ['HS256']});

    if (typeof payload === 'string' || !payload.sub) throw new Error('Invalid token payload');

    return payload.sub;
}

export function generateRefreshToken() : string {

    return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token : string) : string {

    return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}