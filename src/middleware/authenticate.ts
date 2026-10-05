import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { AppError } from '../utils/AppError.js';

export const authenticate : RequestHandler = (req, _res, next) => {

    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer '))
            return next(AppError.unauthorized());

    try {
            req.user = { id : verifyAccessToken(header.slice(7))};
            next();
    } catch {
        
        next(AppError.unauthorized('Invalid or expired token'));
    }
}