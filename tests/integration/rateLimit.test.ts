import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { requestLogger } from '../../src/middleware/requestLogger.js';

function makeApp(limit: number, windowSeconds = 60) {
  const app = express();
  app.use(requestLogger);
  app.get(
    '/ping',
    rateLimit({
      name: `test-${randomUUID()}`, // fresh counters for every test
      limit,
      windowSeconds,
      enabled: true,
      key: (req) => req.headers['x-client'] as string,
    }),
    (_req, res) => res.json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

const hit = (app: express.Express, client: string) =>
  request(app).get('/ping').set('x-client', client);

describe('rate limiter', () => {
  it('allows requests up to the limit, then answers 429 with Retry-After', async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) expect((await hit(app, 'a')).status).toBe(200);

    const blocked = await hit(app, 'a');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('reports the remaining budget', async () => {
    const app = makeApp(5);
    expect((await hit(app, 'a')).headers['ratelimit-remaining']).toBe('4');
    expect((await hit(app, 'a')).headers['ratelimit-remaining']).toBe('3');
  });

  it('limits each client independently', async () => {
    const app = makeApp(1);
    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(429);
    expect((await hit(app, 'b')).status).toBe(200);
  });

  it('lets the client back in when the window ends', async () => {
    const app = makeApp(1, 1);
    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await hit(app, 'a')).status).toBe(200);
  });

  it('fails open when Redis is unavailable', async () => {
    const spy = vi.spyOn(redis, 'eval').mockRejectedValue(new Error('redis down'));
    const res = await hit(makeApp(1), 'a');
    spy.mockRestore();
    expect(res.status).toBe(200);
  });
});