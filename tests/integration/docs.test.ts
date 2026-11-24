import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { openApiDocument } from '../../src/docs/openapi.js';
import { prisma } from '../../src/lib/prisma.js';
import { createSchemaChecker } from '../helpers/schemaValidator.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

interface DocOperation {
  security?: unknown[];
  servers?: { url: string }[];
}
interface Doc {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, DocOperation>>;
  components: { schemas: Record<string, object> };
}
const doc = JSON.parse(JSON.stringify(openApiDocument)) as Doc;

type Method = 'get' | 'post' | 'patch' | 'delete';
const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ method: method as Method, path, op })),
);

const UUID = '7f4a9d0c-5a1e-4b0e-9a3a-2f6f4a1c9b11';
const api = '/api/v1';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const as = (u: TestUser) => ({
  get: (url: string) => request(app).get(url).set(bearer(u.token)),
  post: (url: string, body?: object) => request(app).post(url).set(bearer(u.token)).send(body),
  patch: (url: string, body?: object) => request(app).patch(url).set(bearer(u.token)).send(body),
});

const violations = createSchemaChecker(doc.components.schemas);
const expectMatches = (model: string, body: unknown) =>
  expect(violations(model, body), `${model} does not match its documented schema`).toEqual([]);

describe('the documentation is served', () => {
  it('serves the OpenAPI document and the Swagger UI', async () => {
    const spec = await request(app).get('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');

    const ui = await request(app).get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });
});

describe('every documented operation exists and is protected as documented', () => {
  it.each(operations.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o] as const))(
    '%s',
    async (_label, { method, path, op }) => {
      const prefix = new URL((op.servers ?? doc.servers)[0].url).pathname.replace(/\/$/, '');
      const url = prefix + path.replace(/\{[^}]+\}/g, UUID);

      const res = await request(app)[method](url); // no credentials, no body

      if (op.security?.length) {
        // a missing route would answer 404 "Route ... not found" instead
        expect(res.status).toBe(401);
      } else {
        expect([200, 400, 503]).toContain(res.status); // public: 200 for health, 400 for an empty body
      }
    },
  );
});

describe('real responses match the documented schemas', () => {
  let alice: TestUser;
  let bob: TestUser;
  let orgId: string;
  let projectId: string;
  let taskId: string;
  let registeredId: string;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([createUser(), createUser()]);
  });

  afterAll(async () => {
    await cleanupUsers([alice.id, bob.id, registeredId].filter(Boolean));
    await prisma.$disconnect();
  });

  it('auth: register, login, refresh, me', async () => {
    const email = `contract-${Date.now()}@example.com`;
    const credentials = { email, password: 'correct-horse-battery' };

    const registered = await request(app).post(`${api}/auth/register`).send({ ...credentials, name: 'Contract' });
    registeredId = registered.body.user.id;
    expectMatches('Session', registered.body);

    const login = await request(app).post(`${api}/auth/login`).send(credentials);
    expectMatches('Session', login.body);

    const refreshed = await request(app)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: login.body.refreshToken });
    expectMatches('Tokens', refreshed.body);

    const me = await request(app).get(`${api}/auth/me`).set(bearer(login.body.accessToken));
    expectMatches('Me', me.body);
  });

  it('organizations', async () => {
    const created = await as(alice).post(`${api}/orgs`, { name: 'Contract Inc' });
    expect(created.status).toBe(201);
    orgId = created.body.id;
    expectMatches('OrganizationWithRole', created.body);

    expectMatches('OrganizationList', (await as(alice).get(`${api}/orgs`)).body);
    expectMatches('OrganizationWithRole', (await as(alice).get(`${api}/orgs/${orgId}`)).body);
    expectMatches('Organization', (await as(alice).patch(`${api}/orgs/${orgId}`, { name: 'Contract Co' })).body);
  });

  it('members and invitations', async () => {
    const added = await as(alice).post(`${api}/orgs/${orgId}/members`, { email: bob.email, role: 'MEMBER' });
    expect(added.status).toBe(201);
    expectMatches('Member', added.body);
    expectMatches('MemberList', (await as(alice).get(`${api}/orgs/${orgId}/members`)).body);

    const invited = await as(alice).post(`${api}/orgs/${orgId}/invitations`, {
      email: `invitee-${Date.now()}@example.com`,
    });
    expect(invited.status).toBe(201);
    expectMatches('InvitationCreated', invited.body);
    expectMatches('InvitationList', (await as(alice).get(`${api}/orgs/${orgId}/invitations`)).body);
  });

  it('projects, tasks and comments', async () => {
    const project = await as(alice).post(`${api}/orgs/${orgId}/projects`, { name: 'Website' });
    projectId = project.body.id;
    expectMatches('Project', project.body);
    expectMatches('ProjectPage', (await as(alice).get(`${api}/orgs/${orgId}/projects`)).body);

    const task = await as(alice).post(`${api}/orgs/${orgId}/tasks`, {
      projectId,
      title: 'Write the contract test',
      assigneeId: alice.id,
      dueDate: '2030-01-01',
    });
    expect(task.status).toBe(201);
    taskId = task.body.id;
    expectMatches('Task', task.body);
    expectMatches('TaskPage', (await as(alice).get(`${api}/orgs/${orgId}/tasks`)).body);
    expectMatches('Task', (await as(alice).patch(`${api}/orgs/${orgId}/tasks/${taskId}`, { status: 'DONE' })).body);

    const comment = await as(alice).post(`${api}/orgs/${orgId}/tasks/${taskId}/comments`, { body: 'Looks good' });
    expectMatches('Comment', comment.body);
    expectMatches('CommentPage', (await as(alice).get(`${api}/orgs/${orgId}/tasks/${taskId}/comments`)).body);
  });

  it('audit log', async () => {
    const logs = await as(alice).get(`${api}/orgs/${orgId}/audit-logs`);
    expect(logs.body.data.length).toBeGreaterThan(0);
    expectMatches('AuditLogPage', logs.body);
  });

  it('errors and health', async () => {
    expectMatches('Error', (await request(app).get(`${api}/auth/me`)).body); // 401
    expectMatches('Error', (await as(bob).get(`${api}/orgs/${UUID}`)).body); // 404
    expectMatches('Error', (await as(alice).get(`${api}/orgs/not-a-uuid`)).body); // 400
    expectMatches('Health', (await request(app).get('/health')).body);
  });
});