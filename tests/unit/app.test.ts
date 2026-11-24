import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Replace the connections (database, Redis, queues), so requests that stop at
// authentication or validation never need a real service.
vi.mock('../../src/lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../../src/lib/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn(), ping: vi.fn() },
}));
vi.mock('../../src/jobs/queues.js', () => ({
  EMAIL_QUEUE: 'email',
  MAINTENANCE_QUEUE: 'maintenance',
  emailQueue: { add: vi.fn(), addBulk: vi.fn() },
  maintenanceQueue: { add: vi.fn() },
}));

import { app } from '../../src/app.js';
import { signAccessToken } from '../../src/modules/auth/tokens.js';

const ORG = '7f4a9d0c-5a1e-4b0e-9a3a-2f6f4a1c9b11';
const INVITATION = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const signedIn = { Authorization: `Bearer ${signAccessToken('user-1')}` };

describe('invitation routes are mounted and protected', () => {
  it.each([
    ['POST', '/api/v1/invitations/accept'],
    ['GET', `/api/v1/orgs/${ORG}/invitations`],
    ['POST', `/api/v1/orgs/${ORG}/invitations`],
    ['DELETE', `/api/v1/orgs/${ORG}/invitations/${INVITATION}`],
  ])('%s %s answers 401 without a token', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'get'](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates the accept body before doing any work (400)', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .set(signedIn)
      .send({ token: 'too-short' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('body.token');
  });

  it('validates the organization id before any database lookup (400)', async () => {
    const res = await request(app).get('/api/v1/orgs/not-a-uuid/invitations').set(signedIn);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('params.orgId');
  });

  it('keeps answering unknown routes with the standard 404 and a request id', async () => {
    const res = await request(app).get('/api/v1/invitations/nope');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('documentation and security headers', () => {
  it('serves the OpenAPI document without authentication', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('TaskHub API');
  });

  it('serves the docs UI, and sets security headers on API responses', async () => {
    const docs = await request(app).get('/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');

    const api = await request(app).get('/api/v1/auth/me');
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    expect(api.headers['x-powered-by']).toBeUndefined();
  });
});