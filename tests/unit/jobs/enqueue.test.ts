import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ add: vi.fn(), logError: vi.fn() }));

vi.mock('../../../src/jobs/queues.js', () => ({ emailQueue: { add: mocks.add } }));
vi.mock('../../../src/config/logger.js', () => ({ logger: { error: mocks.logError } }));

import { enqueueInviteEmail, enqueueWelcomeEmail } from '../../../src/jobs/enqueue.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.add.mockResolvedValue({});
});

describe('enqueueWelcomeEmail', () => {
  it('adds a "welcome" job carrying only the user id, and reports success', async () => {
    expect(await enqueueWelcomeEmail('user-1')).toBe(true);
    expect(mocks.add).toHaveBeenCalledWith('welcome', { userId: 'user-1' }, { jobId: 'welcome-user-1' });
  });
});

describe('enqueueInviteEmail', () => {
  it('adds an "invite" job with the invitation id and the raw token', async () => {
    expect(await enqueueInviteEmail('inv-1', 'tok-abc')).toBe(true);
    expect(mocks.add).toHaveBeenCalledWith(
      'invite',
      { invitationId: 'inv-1', token: 'tok-abc' },
      { jobId: 'invite-inv-1' },
    );
  });
});

describe('job ids', () => {
  it('are deterministic, so enqueueing the same thing twice is deduplicated by BullMQ', async () => {
    await enqueueWelcomeEmail('user-1');
    await enqueueWelcomeEmail('user-1');
    const ids = mocks.add.mock.calls.map(([, , opts]) => opts.jobId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('never contain ":", which BullMQ rejects in custom ids', async () => {
    await enqueueWelcomeEmail('user-1');
    await enqueueInviteEmail('inv-1', 'tok');
    for (const [, , opts] of mocks.add.mock.calls) {
      expect(opts.jobId).not.toContain(':');
    }
  });
});

describe('when the queue is unavailable', () => {
  it('returns false and logs instead of throwing at the caller', async () => {
    mocks.add.mockRejectedValue(new Error('redis down'));

    await expect(enqueueWelcomeEmail('user-1')).resolves.toBe(false);
    await expect(enqueueInviteEmail('inv-1', 'tok')).resolves.toBe(false);

    expect(mocks.logError).toHaveBeenCalledTimes(2);
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'welcome' }),
      'Failed to enqueue job',
    );

    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'invite' }),
      'Failed to enqueue job',
    );
  });
});