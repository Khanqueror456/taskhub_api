import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { emailQueue } from '../../src/jobs/queues.js';
import { prisma } from '../../src/lib/prisma.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const api = '/api/v1/orgs';
const bearer = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const as = (u: TestUser) => ({
  get: (url: string) => request(app).get(url).set(bearer(u)),
  post: (url: string, body?: object) => request(app).post(url).set(bearer(u)).send(body),
  del: (url: string) => request(app).delete(url).set(bearer(u)),
});

let alice: TestUser; // owner
let bob: TestUser; // will be invited and accept
let carol: TestUser; // plain member
let dave: TestUser; // invitation gets revoked
let erin: TestUser; // invitation expires
let orgA: string;
let bobInvitation: { id: string; token: string };

// Creates an invitation and reads the raw token from the queued job (a real email would carry it)
async function invite(email: string) {
  const res = await as(alice).post(`${api}/${orgA}/invitations`, { email, role: 'MEMBER' });
  const job = res.status === 201 ? await emailQueue.getJob(`invite-${res.body.id}`) : undefined;
  return { res, id: res.body.id as string, token: job?.data.token as string };
}
const accept = (user: TestUser, token: string) =>
  as(user).post('/api/v1/invitations/accept', { token });

beforeAll(async () => {
  [alice, bob, carol, dave, erin] = await Promise.all([
    createUser(), createUser(), createUser(), createUser(), createUser(),
  ]);
  orgA = (await as(alice).post(api, { name: 'Invite Inc' })).body.id;
  await as(alice).post(`${api}/${orgA}/members`, { email: carol.email, role: 'MEMBER' });
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id, dave.id, erin.id]);
  await prisma.$disconnect();
});

describe('invitations', () => {
  it('creates an invitation and queues the email without exposing the token', async () => {
    const { res, id, token } = await invite(bob.email);
    expect(res.status).toBe(201);
    expect(res.body.emailQueued).toBe(true);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('tokenHash');
    expect(token).toBeTruthy();
    bobInvitation = { id, token };
  });

  it('rejects a second pending invitation and inviting an existing member', async () => {
    expect((await invite(bob.email)).res.status).toBe(409);
    expect((await invite(carol.email)).res.status).toBe(409);
  });

  it('is reserved for admins and owners, and invisible to outsiders', async () => {
    const url = `${api}/${orgA}/invitations`;
    expect((await as(carol).post(url, { email: 'x@example.com' })).status).toBe(403);
    expect((await as(carol).get(url)).status).toBe(403);
    expect((await as(dave).get(url)).status).toBe(404);
    expect((await as(alice).get(url)).body.data).toHaveLength(1);
  });

  it('cannot be accepted by a different account', async () => {
    expect((await accept(carol, bobInvitation.token)).status).toBe(403);
  });

  it('adds the invited member with the invited role when accepted', async () => {
    const res = await accept(bob, bobInvitation.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: orgA, role: 'MEMBER' });
    expect((await as(bob).get(`${api}/${orgA}`)).status).toBe(200);
  });

  it('works only once', async () => {
    expect((await accept(bob, bobInvitation.token)).status).toBe(410);
  });

  it('cannot be accepted after it was revoked', async () => {
    const { id, token } = await invite(dave.email);
    expect((await as(alice).del(`${api}/${orgA}/invitations/${id}`)).status).toBe(204);
    expect((await accept(dave, token)).status).toBe(410);
  });

  it('cannot be accepted after it expired', async () => {
    const { id, token } = await invite(erin.email);
    await prisma.invitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(erin, token)).status).toBe(410);
  });

  it('answers 404 for an unknown token', async () => {
    expect((await accept(erin, 'x'.repeat(43))).status).toBe(404);
  });

  it('is recorded in the audit log', async () => {
    const logs = await as(alice).get(`${api}/${orgA}/audit-logs?limit=100`);
    const actions = logs.body.data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['invitation.created', 'invitation.accepted', 'invitation.revoked', 'member.added']),
    );
  });
});