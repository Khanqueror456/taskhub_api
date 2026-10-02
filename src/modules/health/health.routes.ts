import { Router } from 'express';
import { prisma } from '../../lib/prisma.js'

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({status : 'ok', db : 'up', uptime: Math.round(process.uptime())});
    } catch (err) {
        req.log.error({ err }, 'Health check failed');
        res.status(503).json({status : 'degraded', db: 'down'});
    }
});