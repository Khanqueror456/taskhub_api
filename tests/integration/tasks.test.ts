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
const titlesOf = (res: request.Response) =>
  res.body.data.map((t: { title: string }) => t.title) as string[];

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let orgA: string;
let orgB: string;
let projA: string;
let projB: string;
let taskB: string;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  const a = as(alice);
  const b = as(bob);

  orgA = (await a.post(api, { name: 'Alpha Inc' })).body.id;
  orgB = (await b.post(api, { name: 'Beta Corp' })).body.id;
  await a.post(`${api}/${orgA}/members`, { email: carol.email, role: 'VIEWER' });

  projA = (await a.post(`${api}/${orgA}/projects`, { name: 'Website' })).body.id;
  projB = (await b.post(`${api}/${orgB}/projects`, { name: 'Secret' })).body.id;
  taskB = (await b.post(`${api}/${orgB}/tasks`, { projectId: projB, title: 'Secret plan' })).body.id;

  // Created one by one so createdAt order is predictable
  const mk = (body: object) => a.post(`${api}/${orgA}/tasks`, { projectId: projA, ...body });
  await mk({ title: 'Fix login bug', status: 'TODO', priority: 'HIGH', dueDate: '2020-01-01' });
  await mk({ title: 'Write docs', status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: '2099-01-01' });
  await mk({ title: 'Deploy service', status: 'DONE', priority: 'LOW', dueDate: '2020-01-01' });
  await mk({ title: 'Review pull request', status: 'TODO', priority: 'LOW', assigneeId: alice.id });
  await mk({ title: 'Plan roadmap', status: 'TODO', priority: 'MEDIUM' });
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id]); // orgs cascade to projects, tasks, comments
  await prisma.$disconnect();
});

describe('tenant isolation', () => {
  it("cannot reach another tenant's projects or tasks", async () => {
    const a = as(alice);
    expect((await a.get(`${api}/${orgB}/projects`)).status).toBe(404);
    expect((await a.get(`${api}/${orgB}/tasks`)).status).toBe(404);
  });

  it("cannot reach a foreign task through her own org's URL", async () => {
    const a = as(alice);
    expect((await a.get(`${api}/${orgA}/tasks/${taskB}`)).status).toBe(404);
    expect((await a.patch(`${api}/${orgA}/tasks/${taskB}`, { title: 'Hacked' })).status).toBe(404);
    expect((await a.del(`${api}/${orgA}/tasks/${taskB}`)).status).toBe(404);

    const intact = await as(bob).get(`${api}/${orgB}/tasks/${taskB}`);
    expect(intact.status).toBe(200);
    expect(intact.body.title).toBe('Secret plan');
  });

  it('cannot attach a task to a foreign project', async () => {
    const res = await as(alice).post(`${api}/${orgA}/tasks`, { projectId: projB, title: 'Sneaky' });
    expect(res.status).toBe(404);
  });

  it('cannot assign a task to someone outside the org', async () => {
    const res = await as(alice).post(`${api}/${orgA}/tasks`, {
      projectId: projA,
      title: 'Bad assignee',
      assigneeId: bob.id,
    });
    expect(res.status).toBe(400);
  });

  it("never leaks another tenant's tasks into a list", async () => {
    const res = await as(alice).get(`${api}/${orgA}/tasks?limit=100`);
    expect(res.body.data).toHaveLength(5);
    expect(titlesOf(res)).not.toContain('Secret plan');
  });
});

describe('filtering, sorting and search', () => {
  const list = (query: string) => as(alice).get(`${api}/${orgA}/tasks?${query}`);

  it('sorts newest first by default', async () => {
    expect(titlesOf(await list(''))[0]).toBe('Plan roadmap');
  });

  it('filters by status and priority', async () => {
    expect(titlesOf(await list('status=DONE'))).toEqual(['Deploy service']);
    expect(titlesOf(await list('priority=HIGH'))).toEqual(['Fix login bug']);
  });

  it('finds overdue tasks, ignoring finished ones', async () => {
    expect(titlesOf(await list('overdue=true'))).toEqual(['Fix login bug']);
  });

  it('filters by assignee', async () => {
    expect(titlesOf(await list('assignee=me'))).toEqual(['Review pull request']);
    expect(titlesOf(await list('assignee=unassigned'))).toHaveLength(4);
  });

  it('searches titles', async () => {
    expect(titlesOf(await list('search=docs'))).toEqual(['Write docs']);
  });

  it('rejects invalid query parameters', async () => {
    expect((await list('limit=1000')).status).toBe(400);
    expect((await list('status=BOGUS')).status).toBe(400);
  });
});

describe('cursor pagination', () => {
  it('walks through every task exactly once', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let i = 0; i < 10; i++) {
      const res = await as(alice).get(
        `${api}/${orgA}/tasks?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...res.body.data.map((t: { id: string }) => t.id));
      if (!res.body.pagination.hasMore) break;
      cursor = res.body.pagination.nextCursor;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe('RBAC on projects and tasks', () => {
  it('lets a VIEWER read but not write', async () => {
    const c = as(carol);
    expect((await c.get(`${api}/${orgA}/tasks`)).status).toBe(200);
    expect((await c.post(`${api}/${orgA}/tasks`, { projectId: projA, title: 'x' })).status).toBe(403);
    expect((await c.post(`${api}/${orgA}/projects`, { name: 'x' })).status).toBe(403);
  });

  it('lets a MEMBER write tasks but not projects', async () => {
    const promote = await as(alice).patch(`${api}/${orgA}/members/${carol.id}`, { role: 'MEMBER' });
    expect(promote.body.role).toBe('MEMBER');

    const c = as(carol);
    expect((await c.post(`${api}/${orgA}/tasks`, { projectId: projA, title: 'By Carol' })).status).toBe(201);
    expect((await c.post(`${api}/${orgA}/projects`, { name: 'x' })).status).toBe(403);
  });
});

describe('comments', () => {
  let taskId: string;
  let carolComment: string;
  let aliceComment: string;

  beforeAll(async () => {
    taskId = (await as(alice).get(`${api}/${orgA}/tasks?limit=1`)).body.data[0].id;
  });

  it('lets members comment and list comments', async () => {
    const created = await as(carol).post(`${api}/${orgA}/tasks/${taskId}/comments`, { body: 'Looks good' });
    expect(created.status).toBe(201);
    carolComment = created.body.id;
    aliceComment = (await as(alice).post(`${api}/${orgA}/tasks/${taskId}/comments`, { body: 'Thanks' })).body.id;

    const list = await as(alice).get(`${api}/${orgA}/tasks/${taskId}/comments`);
    expect(list.body.data).toHaveLength(2);
  });

  it("stops a member deleting someone else's comment", async () => {
    const res = await as(carol).del(`${api}/${orgA}/tasks/${taskId}/comments/${aliceComment}`);
    expect(res.status).toBe(403);
  });

  it('lets authors and admins delete', async () => {
    expect((await as(carol).del(`${api}/${orgA}/tasks/${taskId}/comments/${carolComment}`)).status).toBe(204);
    expect((await as(alice).del(`${api}/${orgA}/tasks/${taskId}/comments/${aliceComment}`)).status).toBe(204);
  });

  it("hides comments of another tenant's task", async () => {
    expect((await as(alice).get(`${api}/${orgA}/tasks/${taskB}/comments`)).status).toBe(404);
  });
});