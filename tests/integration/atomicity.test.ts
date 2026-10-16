import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const state = vi.hoisted(() => ({ failAudit: false }));

// Wrap the real recordAudit so a test can make it throw
vi.mock('../../src/modules/audit/audit.recorder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/audit/audit.recorder.js')>();
  return {
    ...actual,
    recordAudit: (...args: Parameters<typeof actual.recordAudit>) => {
      if (state.failAudit) throw new Error('audit write failed');
      return actual.recordAudit(...args);
    },
  };
});

import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const api = '/api/v1/orgs';
let alice: TestUser;
let orgId: string;
let projectId: string;

beforeAll(async () => {
  alice = await createUser();
  const h = { Authorization: `Bearer ${alice.token}` };
  orgId = (await request(app).post(api).set(h).send({ name: 'Atomic Inc' })).body.id;
  projectId = (await request(app).post(`${api}/${orgId}/projects`).set(h).send({ name: 'P' })).body.id;
});

afterAll(async () => {
  await cleanupUsers([alice.id]);
  await prisma.$disconnect();
});

describe('transactional audit logging', () => {
  it('rolls back the change when the audit entry cannot be written', async () => {
    const before = await prisma.task.count({ where: { organizationId: orgId } });

    state.failAudit = true;
    const res = await request(app)
      .post(`${api}/${orgId}/tasks`)
      .set({ Authorization: `Bearer ${alice.token}` })
      .send({ projectId, title: 'Should not survive' });
    state.failAudit = false;

    expect(res.status).toBe(500);
    expect(await prisma.task.count({ where: { organizationId: orgId } })).toBe(before);
  });
});