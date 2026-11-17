import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDel = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/lib/cache.js', () => ({ cacheDel }));

import {
  invalidateMemberships,
  MEMBERSHIP_TTL_SECONDS,
  membershipKey,
} from '../../../../src/modules/rbac/membershipCache.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('membershipKey', () => {
  it('combines organization and user', () => {
    expect(membershipKey('org1', 'u1')).toBe('membership:org1:u1');
  });

  it('gives different keys to different organizations and users', () => {
    const keys = new Set([
      membershipKey('org1', 'u1'),
      membershipKey('org1', 'u2'),
      membershipKey('org2', 'u1'),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('MEMBERSHIP_TTL_SECONDS', () => {
  it('is one minute, which bounds how long a stale permission can survive', () => {
    expect(MEMBERSHIP_TTL_SECONDS).toBe(60);
  });
});

describe('invalidateMemberships', () => {
  it('deletes exactly the keys of the listed users in that organization', async () => {
    await invalidateMemberships('org1', ['u1', 'u2']);
    expect(cacheDel).toHaveBeenCalledWith('membership:org1:u1', 'membership:org1:u2');
  });

  it('passes no keys when there are no users (cacheDel then does nothing)', async () => {
    await invalidateMemberships('org1', []);
    expect(cacheDel).toHaveBeenCalledWith();
  });
});