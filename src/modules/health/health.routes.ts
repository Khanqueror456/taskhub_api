import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const [db, cache] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      (err: unknown) => {
        req.log.error({ err }, 'Database health check failed');
        return false;
      },
    ),
    redis.ping().then(
      () => true,
      () => false,
    ),
  ]);

  res.status(db ? 200 : 503).json({
    status: !db ? 'down' : cache ? 'ok' : 'degraded',
    db: db ? 'up' : 'down',
    redis: cache ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
  });
});