import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { orgKey } from '../../src/middleware/limiters.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { requestLogger } from '../../src/middleware/requestLogger.js';

// Mini app: a stub stands in for `authorize` and sets req.membership from a header
function makeApp(limit: number) {
  const app = express();
  app.use(requestLogger);
  app.use((req, _res, next) => {
    const orgId = req.headers['x-org'];
    if (typeof orgId === 'string') {
      Object.assign(req, { membership: { organizationId: orgId, role: 'MEMBER' } });
    }
    next();
  });
  app.get(
    '/work',
    rateLimit({
      name: `test-${randomUUID()}`, // fresh counters for every app
      limit,
      windowSeconds: 60,
      enabled: true, // the global switch is off in tests
      key: orgKey, // the real key function from limiters.ts
    }),
    (_req, res) => res.json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

const call = (app: express.Express, org: string | null, user: string) => {
  const req = request(app).get('/work').set('x-user', user);
  return org ? req.set('x-org', org) : req;
};

describe('per-organization rate limit', () => {
  it('shares one budget between all users of the same org', async () => {
    const app = makeApp(2);
    const org = randomUUID();

    expect((await call(app, org, 'alice')).status).toBe(200);
    expect((await call(app, org, 'bob')).status).toBe(200);

    // The budget of 2 is used up, so both users are blocked
    expect((await call(app, org, 'alice')).status).toBe(429);
    expect((await call(app, org, 'bob')).status).toBe(429);
  });

  it('gives each organization its own budget', async () => {
    const app = makeApp(1);
    const orgA = randomUUID();
    const orgB = randomUUID();

    expect((await call(app, orgA, 'alice')).status).toBe(200);
    expect((await call(app, orgA, 'alice')).status).toBe(429);
    expect((await call(app, orgB, 'carol')).status).toBe(200);
  });

  it('answers with the standard 429 error shape', async () => {
    const app = makeApp(1);
    const org = randomUUID();
    await call(app, org, 'alice');

    const res = await call(app, org, 'alice');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does nothing when there is no verified membership', async () => {
    const app = makeApp(1);

    for (let i = 0; i < 3; i++) {
      const res = await call(app, null, 'anonymous');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    }
  });
});