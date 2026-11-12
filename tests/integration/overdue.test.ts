import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { emailQueue, maintenanceQueue } from '../../src/jobs/queues.js';
import { scanOverdue } from '../../src/jobs/processors/scanOverdue.js';
import { processEmailJob } from '../../src/jobs/processors/sendEmail.js';
import { registerSchedules } from '../../src/jobs/scheduler.js';
import { prisma } from '../../src/lib/prisma.js';
import { FakeMailer } from '../helpers/fakeMailer.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const api = '/api/v1/orgs';
const as = (u: TestUser) => ({
  post: (url: string, body?: object) =>
    request(app).post(url).set({ Authorization: `Bearer ${u.token}` }).send(body),
});

const now = new Date();
const today = now.toISOString().slice(0, 10);
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  const org = (await as(alice).post(api, { name: 'Late Inc' })).body.id;
  await as(alice).post(`${api}/${org}/members`, { email: carol.email, role: 'MEMBER' });
  const projectId = (await as(alice).post(`${api}/${org}/projects`, { name: 'P' })).body.id;

  const task = (body: object) => as(alice).post(`${api}/${org}/tasks`, { projectId, ...body });
  await task({ title: 'Late task', dueDate: '2020-01-01', assigneeId: alice.id });
  await task({ title: 'Finished late task', dueDate: '2020-01-01', assigneeId: alice.id, status: 'DONE' });
  await task({ title: 'Future task', dueDate: '2099-01-01', assigneeId: alice.id });
  await task({ title: 'Carol late task', dueDate: '2020-01-01', assigneeId: carol.id });
  // bob has no tasks at all
});

afterAll(async () => {
  await cleanupUsers([alice.id, bob.id, carol.id]);
  await prisma.$disconnect();
});

describe('overdue reminders', () => {
  it('queues one digest per user who has overdue work', async () => {
    expect(await scanOverdue(now)).toBeGreaterThanOrEqual(2);

    for (const user of [alice, carol]) {
      const job = await emailQueue.getJob(`overdue-${user.id}-${today}`);
      expect(job?.data).toEqual({ userId: user.id, date: today });
    }
    expect(await emailQueue.getJob(`overdue-${bob.id}-${today}`)).toBeUndefined();
  });

  it('queues nothing new when the scan runs again the same day', async () => {
    await scanOverdue(now);
    await scanOverdue(now);

    const jobs = await emailQueue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
    expect(jobs.filter((j) => j.id === `overdue-${alice.id}-${today}`)).toHaveLength(1);
  });

  it('lists only overdue, unfinished tasks of the recipient', async () => {
    const mailer = new FakeMailer();
    await processEmailJob({ name: 'overdue-digest', data: { userId: alice.id, date: today } }, { mailer });

    expect(mailer.sent).toHaveLength(1);
    const { to, text } = mailer.sent[0];
    expect(to).toBe(alice.email);
    expect(text).toContain('Late task');
    expect(text).not.toContain('Finished late task');
    expect(text).not.toContain('Future task');
    expect(text).not.toContain('Carol late task');
  });

  it('sends nothing when nobody has anything overdue', async () => {
    const mailer = new FakeMailer();
    await processEmailJob({ name: 'overdue-digest', data: { userId: bob.id, date: today } }, { mailer });
    expect(mailer.sent).toHaveLength(0);
  });

  it('registers the daily scan once, however often the worker starts', async () => {
    await registerSchedules();
    await registerSchedules();

    const schedulers = await maintenanceQueue.getJobSchedulers();
    expect(schedulers.filter((s) => s.name === 'scan-overdue')).toHaveLength(1);
  });
});