import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
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
let projA: string;
let taskId: string;

const audit = (query = '') => as(alice).get(`${api}/${orgA}/audit-logs?${query}`);
const actionsOf = (res: request.Response) =>
  res.body.data.map((e: { action: string }) => e.action) as string[];

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  orgA = (await as(alice).post(api, { name: 'Alpha Inc' })).body.id;
  await as(alice).post(`${api}/${orgA}/members`, { email: carol.email, role: 'MEMBER' });
  projA = (await as(alice).post(`${api}/${orgA}/projects`, { name: 'Website' })).body.id;
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id]);
  await prisma.$disconnect();
});

describe('audit trail', () => {
  it('records who created a task, with the request id', async () => {
    const res = await request(app)
      .post(`${api}/${orgA}/tasks`)
      .set(bearer(alice))
      .set('x-request-id', 'req-audit-test-1')
      .send({ projectId: projA, title: 'Audited task', status: 'TODO' });
    expect(res.status).toBe(201);
    taskId = res.body.id;

    const logs = await audit(`entityType=task&entityId=${taskId}`);
    expect(logs.body.data).toHaveLength(1);
    expect(logs.body.data[0]).toMatchObject({
      action: 'task.created',
      actorId: alice.id,
      requestId: 'req-audit-test-1',
    });
    expect(logs.body.data[0].after.title).toBe('Audited task');
  });

  it('records only the fields that changed', async () => {
    await as(alice).patch(`${api}/${orgA}/tasks/${taskId}`, { status: 'DONE' });
    const logs = await audit(`entityId=${taskId}&action=task.updated`);
    expect(logs.body.data).toHaveLength(1);
    expect(logs.body.data[0].before).toEqual({ status: 'TODO' });
    expect(logs.body.data[0].after).toEqual({ status: 'DONE' });
  });

  it('writes nothing for an update that changes nothing', async () => {
    await as(alice).patch(`${api}/${orgA}/tasks/${taskId}`, { status: 'DONE' });
    const logs = await audit(`entityId=${taskId}&action=task.updated`);
    expect(logs.body.data).toHaveLength(1);
  });

  it('keeps a snapshot of deleted entities and an ordered history', async () => {
    expect((await as(alice).del(`${api}/${orgA}/tasks/${taskId}`)).status).toBe(204);

    const history = await audit(`entityId=${taskId}`);
    expect(actionsOf(history)).toEqual(['task.deleted', 'task.updated', 'task.created']);
    expect(history.body.data[0].before.title).toBe('Audited task');
  });

  it('is visible to admins and owners only, and only inside the tenant', async () => {
    expect((await as(carol).get(`${api}/${orgA}/audit-logs`)).status).toBe(403);
    expect((await as(bob).get(`${api}/${orgA}/audit-logs`)).status).toBe(404);
    expect((await audit()).status).toBe(200);
  });

  it("unassigns a removed member's tasks atomically and logs it", async () => {
    const t = (
      await as(alice).post(`${api}/${orgA}/tasks`, {
        projectId: projA,
        title: 'Carol work',
        assigneeId: carol.id,
      })
    ).body.id;

    expect((await as(alice).del(`${api}/${orgA}/members/${carol.id}`)).status).toBe(204);

    const task = await as(alice).get(`${api}/${orgA}/tasks/${t}`);
    expect(task.body.assigneeId).toBeNull();

    const logs = await audit('action=member.removed');
    expect(logs.body.data[0].after).toEqual({ unassignedTasks: 1 });
  });

  it('keeps the history of an organization after it is deleted', async () => {
    const orgC = (await as(alice).post(api, { name: 'Temporary Org' })).body.id;
    expect((await as(alice).del(`${api}/${orgC}`)).status).toBe(204);

    const rows = await prisma.auditLog.findMany({ where: { organizationId: orgC } });
    expect(rows.map((r) => r.action).sort()).toEqual(['org.created', 'org.deleted']);
  });
});