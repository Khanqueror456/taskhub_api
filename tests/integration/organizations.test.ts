import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const api = '/api/v1/orgs';
const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let orgA: string; // Alice's org
let orgB: string; // Bob's org

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  orgA = (await request(app).post(api).set(bearer(alice)).send({ name: 'Alpha Inc' })).body.id;
  orgB = (await request(app).post(api).set(bearer(bob)).send({ name: 'Beta Corp' })).body.id;
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id]);
  await prisma.$disconnect();
});

describe('tenant isolation', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(api)).status).toBe(401);
  });

  it('lists only organizations the user belongs to', async () => {
    const res = await request(app).get(api).set(bearer(alice));
    const ids = res.body.data.map((o: { id: string }) => o.id);
    expect(ids).toContain(orgA);
    expect(ids).not.toContain(orgB);
  });

  it("returns 404 on every route of another tenant's org", async () => {
    const attempts = [
      request(app).get(`${api}/${orgB}`),
      request(app).patch(`${api}/${orgB}`).send({ name: 'Hacked' }),
      request(app).delete(`${api}/${orgB}`),
      request(app).get(`${api}/${orgB}/members`),
      request(app).post(`${api}/${orgB}/members`).send({ email: alice.email }),
      request(app).delete(`${api}/${orgB}/members/${bob.id}`),
    ];
    for (const attempt of attempts) {
      const res = await attempt.set(bearer(alice));
      expect(res.status).toBe(404);
    }
  });

  it("leaves the other tenant's data untouched", async () => {
    const res = await request(app).get(`${api}/${orgB}`).set(bearer(bob));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Beta Corp');
  });
});

describe('role-based access control', () => {
  it('lets the owner add a member as VIEWER', async () => {
    const res = await request(app)
      .post(`${api}/${orgA}/members`)
      .set(bearer(alice))
      .send({ email: carol.email, role: 'VIEWER' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('VIEWER');
  });

  it('rejects adding the same user twice', async () => {
    const res = await request(app)
      .post(`${api}/${orgA}/members`)
      .set(bearer(alice))
      .send({ email: carol.email });
    expect(res.status).toBe(409);
  });

  it('rejects assigning OWNER through the API', async () => {
    const res = await request(app)
      .patch(`${api}/${orgA}/members/${carol.id}`)
      .set(bearer(alice))
      .send({ role: 'OWNER' });
    expect(res.status).toBe(400);
  });

  it('lets a VIEWER read but not write', async () => {
    expect((await request(app).get(`${api}/${orgA}`).set(bearer(carol))).status).toBe(200);
    expect(
      (await request(app).patch(`${api}/${orgA}`).set(bearer(carol)).send({ name: 'Nope' })).status,
    ).toBe(403);
    expect(
      (await request(app).post(`${api}/${orgA}/members`).set(bearer(carol)).send({ email: bob.email }))
        .status,
    ).toBe(403);
  });

  it('lets an ADMIN update the org but not delete it', async () => {
    const promote = await request(app)
      .patch(`${api}/${orgA}/members/${carol.id}`)
      .set(bearer(alice))
      .send({ role: 'ADMIN' });
    expect(promote.status).toBe(200);

    const update = await request(app)
      .patch(`${api}/${orgA}`)
      .set(bearer(carol))
      .send({ name: 'Alpha Renamed' });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe('Alpha Renamed');

    expect((await request(app).delete(`${api}/${orgA}`).set(bearer(carol))).status).toBe(403);
  });

  it('never lets the owner be changed or removed', async () => {
    const remove = await request(app).delete(`${api}/${orgA}/members/${alice.id}`).set(bearer(carol));
    expect(remove.status).toBe(403);
    const demote = await request(app)
      .patch(`${api}/${orgA}/members/${alice.id}`)
      .set(bearer(carol))
      .send({ role: 'VIEWER' });
    expect(demote.status).toBe(403);
  });

  it('lets the owner delete the org', async () => {
    expect((await request(app).delete(`${api}/${orgA}`).set(bearer(alice))).status).toBe(204);
    expect((await request(app).get(`${api}/${orgA}`).set(bearer(alice))).status).toBe(404);
  });
});