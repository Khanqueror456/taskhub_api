import { randomUUID } from 'node:crypto';
import { QueueEvents } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bullConnection } from '../../src/jobs/connection.js';
import { EMAIL_QUEUE, emailQueue } from '../../src/jobs/queues.js';
import { createWorkers } from '../../src/jobs/workers.js';
import { prisma } from '../../src/lib/prisma.js';
import { FakeMailer } from '../helpers/fakeMailer.js';
import { cleanupUsers, createUser, type TestUser } from '../helpers/users.js';

const mailer = new FakeMailer();
let workers: ReturnType<typeof createWorkers>;
let events: QueueEvents;
let alice: TestUser;

beforeAll(async () => {
  await emailQueue.drain(); // forget jobs left behind by other test files
  alice = await createUser(); // registering queues a welcome email

  workers = createWorkers({ mailer });
  events = new QueueEvents(EMAIL_QUEUE, { connection: bullConnection('worker') });
  await events.waitUntilReady();
  await workers.emailWorker.waitUntilReady();
});

afterAll(async () => {
  await workers.close();
  await events.close();
  await cleanupUsers([alice.id]);
  await prisma.$disconnect();
});

describe('email worker', () => {
  it('sends the welcome email that registration queued', async () => {
    const job = await emailQueue.getJob(`welcome-${alice.id}`);
    expect(job).toBeDefined();
    await job!.waitUntilFinished(events);

    const mail = mailer.sent.find((m) => m.to === alice.email);
    expect(mail?.subject).toMatch(/welcome/i);
  });

  it('retries a failing send and delivers once the problem is gone', async () => {
    const before = mailer.attempts;
    mailer.failuresLeft = 2;

    const job = await emailQueue.add('welcome', { userId: alice.id }, { jobId: `retry-${randomUUID()}` });
    await job.waitUntilFinished(events);

    expect(mailer.attempts - before).toBe(3); // two failures, then success
    expect(await job.getState()).toBe('completed');
  });

  it('does not retry a job that can never succeed', async () => {
    const before = mailer.attempts;
    const job = await emailQueue.add('welcome', { userId: randomUUID() }, { jobId: `ghost-${randomUUID()}` });

    await expect(job.waitUntilFinished(events)).rejects.toThrow(/no longer exists/);
    expect(await job.getState()).toBe('failed');
    expect(mailer.attempts).toBe(before); // never even tried to send
  });

  it('gives up after the allowed attempts and keeps the job as failed', async () => {
    const before = mailer.attempts;
    mailer.failuresLeft = 99;

    const job = await emailQueue.add(
      'welcome',
      { userId: alice.id },
      { jobId: `exhaust-${randomUUID()}`, attempts: 3 },
    );
    await expect(job.waitUntilFinished(events)).rejects.toThrow('SMTP down');
    mailer.failuresLeft = 0;

    expect(mailer.attempts - before).toBe(3);
    expect(await job.getState()).toBe('failed');
  });

  it('adds a job with an existing id only once', async () => {
    const id = `dedupe-${randomUUID()}`;
    await emailQueue.add('welcome', { userId: alice.id }, { jobId: id });
    await emailQueue.add('welcome', { userId: alice.id }, { jobId: id });

    const jobs = await emailQueue.getJobs(['waiting', 'active', 'delayed', 'completed']);
    expect(jobs.filter((j) => j.id === id)).toHaveLength(1);
  });
});