import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../src/config/env.js';

const mocks = vi.hoisted(() => ({ on: vi.fn(), Queue: vi.fn(), logError: vi.fn() }));

vi.mock('bullmq', () => ({ Queue: mocks.Queue }));
vi.mock('../../../src/jobs/connection.js', () => ({
  bullConnection: (role: string) => ({ role }),
}));
vi.mock('../../../src/config/logger.js', () => ({ logger: { error: mocks.logError } }));

// queues.ts creates its queues when imported, so reload it for every test
async function loadQueues() {
  vi.resetModules();
  mocks.Queue.mockImplementation(function (name: string) {
    return { name, on: mocks.on };
  });
  return import('../../../src/jobs/queues.js');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('jobs/queues', () => {
  it('names the two queues', async () => {
    const queues = await loadQueues();
    expect(queues.EMAIL_QUEUE).toBe('email');
    expect(queues.MAINTENANCE_QUEUE).toBe('maintenance');
  });

  it('retries 5 times with exponential backoff and keeps history for inspection', async () => {
    const { defaultJobOptions } = await loadQueues();
    expect(defaultJobOptions).toEqual({
      attempts: 5,
      backoff: { type: 'exponential', delay: env.JOB_BACKOFF_MS },
      removeOnComplete: { age: 86_400, count: 1000 }, // one day
      removeOnFail: { age: 604_800 }, // one week
    });
  });

  it('creates both queues on a producer connection with the default options', async () => {
    const queues = await loadQueues();
    expect(mocks.Queue).toHaveBeenCalledTimes(2);
    for (const name of ['email', 'maintenance']) {
      expect(mocks.Queue).toHaveBeenCalledWith(name, {
        connection: { role: 'producer' },
        defaultJobOptions: queues.defaultJobOptions,
      });
    }
    expect(queues.emailQueue.name).toBe('email');
    expect(queues.maintenanceQueue.name).toBe('maintenance');
  });

  it('logs queue connection errors instead of crashing the process', async () => {
    await loadQueues();
    expect(mocks.on).toHaveBeenCalledTimes(2);
    expect(mocks.on.mock.calls.every(([event]) => event === 'error')).toBe(true);

    const [, handler] = mocks.on.mock.calls[0];
    handler(new Error('ECONNRESET'));
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'email' }),
      'Queue error',
    );
  });
});