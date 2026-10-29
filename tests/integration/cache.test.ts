import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { redis } from '../../src/lib/redis.js';
import { prisma } from '../../src/lib/prisma.js';
import { membershipKey } from '../../src/modules/rbac/membershipCache.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const api = '/api/v1/orgs';
const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const as = (u: TestUser) => ({
  get: (url: string) => request(app).get(url).set(bearer(u)),
  post: (url: string, body?: object) => request(app).post(url).set(bearer(u)).send(body),
  patch: (url: string, body?: object) => request(app).patch(url).set(bearer(u)).send(body),
  del: (url: string) => request(app).delete(url).set(bearer(u)),
});

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let orgA: string;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  orgA = (await as(alice).post(api, { name: 'Cache Inc' })).body.id;
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id]);
  await prisma.$disconnect();
});

describe('membership cache', () => {
  it('is filled by the first authorized request, with a TTL', async () => {
    const key = membershipKey(orgA, alice.id);
    await redis.del(key);

    expect((await as(alice).get(`${api}/${orgA}`)).status).toBe(200);

    expect(JSON.parse((await redis.get(key))!)).toMatchObject({ role: 'OWNER' });
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('never caches non-members', async () => {
    expect((await as(bob).get(`${api}/${orgA}`)).status).toBe(404);
    expect(await redis.get(membershipKey(orgA, bob.id))).toBeNull();
  });

  it('applies a role change immediately', async () => {
    await as(alice).post(`${api}/${orgA}/members`, { email: carol.email, role: 'ADMIN' });
    expect((await as(carol).patch(`${api}/${orgA}`, { name: 'By Carol' })).status).toBe(200);

    await as(alice).patch(`${api}/${orgA}/members/${carol.id}`, { role: 'VIEWER' });
    expect((await as(carol).patch(`${api}/${orgA}`, { name: 'Again' })).status).toBe(403);
  });

  it('applies a removal immediately', async () => {
    expect((await as(carol).get(`${api}/${orgA}`)).status).toBe(200); // cached as VIEWER

    await as(alice).del(`${api}/${orgA}/members/${carol.id}`);

    expect(await redis.get(membershipKey(orgA, carol.id))).toBeNull();
    expect((await as(carol).get(`${api}/${orgA}`)).status).toBe(404);
  });

  it('keeps working when Redis is down', async () => {
    const get = vi.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
    const res = await as(alice).get(`${api}/${orgA}`);
    get.mockRestore();
    expect(res.status).toBe(200);
  });

  it('drops cached memberships when the organization is deleted', async () => {
    await as(alice).get(`${api}/${orgA}`); // make sure the entry exists
    expect((await as(alice).del(`${api}/${orgA}`)).status).toBe(204);

    expect(await redis.get(membershipKey(orgA, alice.id))).toBeNull();
    expect((await as(alice).get(`${api}/${orgA}`)).status).toBe(404);
  });
});