import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cached: vi.fn(), findUnique: vi.fn(), orgLimiter: vi.fn() }));
vi.mock('../../../src/lib/cache.js', () => ({ cached: mocks.cached, cacheDel: vi.fn() }));
vi.mock('../../../src/lib/prisma.js', () => ({
  prisma: { membership: { findUnique: mocks.findUnique } },
}));
vi.mock('../../../src/middleware/limiters.js', () => ({ orgLimiter: mocks.orgLimiter }));

import { authorize } from '../../../src/middleware/authorize.js';
import type { Permission } from '../../../src/modules/rbac/permissions.js';
import { mockReq, mockRes } from '../helpers/http.js';

const request = (overrides: Record<string, unknown> = {}) =>
  mockReq({ user: { id: 'u1' }, params: { orgId: 'org1' }, ...overrides });

const asMember = (role: string | null) =>
  mocks.findUnique.mockResolvedValue(role ? { organizationId: 'org1', role } : null);

beforeEach(() => {
  vi.resetAllMocks();
  // Cache miss every time: run the loader
  mocks.cached.mockImplementation(async (_key: string, _ttl: number, load: () => Promise<unknown>) =>
    load(),
  );
  mocks.orgLimiter.mockImplementation((_req: unknown, _res: unknown, next: () => void) => next());
});

describe('authorize', () => {
  it('looks the membership up through the cache, keyed by org and user, for 60 seconds', async () => {
    asMember('MEMBER');

    await authorize('org:read')(request(), mockRes(), vi.fn());

    expect(mocks.cached).toHaveBeenCalledWith('membership:org1:u1', 60, expect.any(Function));
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u1', organizationId: 'org1' } },
      select: { organizationId: true, role: true },
    });
  });

  it('stores the verified membership on the request and hands over to the org rate limiter', async () => {
    asMember('ADMIN');
    const req = request();
    const res = mockRes();
    const next = vi.fn();

    await authorize('member:manage')(req, res, next);

    expect(req.membership).toEqual({ organizationId: 'org1', role: 'ADMIN' });
    expect(mocks.orgLimiter).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('does not touch the database when the cache already knows the membership', async () => {
    mocks.cached.mockResolvedValue({ organizationId: 'org1', role: 'VIEWER' });
    const req = request();

    await authorize('org:read')(req, mockRes(), vi.fn());

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(req.membership).toEqual({ organizationId: 'org1', role: 'VIEWER' });
  });

  it('answers 404, revealing nothing, when the user is not a member', async () => {
    asMember(null);
    const req = request();

    await expect(authorize('org:read')(req, mockRes(), vi.fn())).rejects.toMatchObject({
      statusCode: 404,
      message: 'Organization not found',
    });
    expect(req.membership).toBeUndefined();
    expect(mocks.orgLimiter).not.toHaveBeenCalled();
  });

  it.each<[string, Permission]>([
    ['VIEWER', 'task:write'],
    ['MEMBER', 'project:write'],
    ['MEMBER', 'audit:read'],
    ['ADMIN', 'org:delete'],
  ])('answers 403 when a %s asks for %s', async (role, permission) => {
    asMember(role);
    const req = request();

    await expect(authorize(permission)(req, mockRes(), vi.fn())).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(req.membership).toBeUndefined();
    expect(mocks.orgLimiter).not.toHaveBeenCalled();
  });

  it('takes the organization from the route, never from the request body', async () => {
    asMember('OWNER');

    await authorize('org:read')(request({ body: { orgId: 'attacker-org' } }), mockRes(), vi.fn());

    expect(mocks.findUnique.mock.calls[0][0].where.userId_organizationId.organizationId).toBe('org1');
  });

  it('lets a database failure propagate instead of letting the request through', async () => {
    mocks.findUnique.mockRejectedValue(new Error('db down'));
    const req = request();

    await expect(authorize('org:read')(req, mockRes(), vi.fn())).rejects.toThrow('db down');
    expect(req.membership).toBeUndefined();
  });
});