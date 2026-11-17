import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({ refreshToken: { updateMany: vi.fn(), create: vi.fn() } }));
const mocks = vi.hoisted(() => ({
  hash: vi.fn().mockResolvedValue('dummy-hash'), // auth.service hashes a dummy password on import
  verify: vi.fn(),
  userFindUnique: vi.fn(),
  tokenCreate: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('argon2', () => ({ default: { hash: mocks.hash, verify: mocks.verify } }));
vi.mock('../../../../src/config/env.js', () => ({
  env: { ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7 },
}));
vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, create: vi.fn() },
    refreshToken: {
      create: mocks.tokenCreate,
      findUnique: mocks.tokenFindUnique,
      updateMany: mocks.tokenUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock('../../../../src/jobs/enqueue.js', () => ({ enqueueWelcomeEmail: vi.fn() }));
vi.mock('../../../../src/modules/auth/tokens.js', () => ({
  signAccessToken: (userId: string) => `access:${userId}`,
  generateRefreshToken: () => 'new-refresh',
  hashRefreshToken: (token: string) => `hash:${token}`,
}));

import { getMe, login, logout, refresh } from '../../../../src/modules/auth/auth.service.js';

const NOW = new Date('2026-11-10T10:00:00Z');
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (err: unknown) => err as Error,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('login', () => {
  const stored = {
    id: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    passwordHash: 'stored-hash',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const credentials = { email: 'ada@example.com', password: 'correct-horse-battery' };

  beforeEach(() => {
    mocks.userFindUnique.mockResolvedValue(stored);
    mocks.verify.mockResolvedValue(true);
    mocks.tokenCreate.mockResolvedValue({});
  });

  it('looks the user up by email and verifies the password against the stored hash', async () => {
    await login(credentials);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
    expect(mocks.verify).toHaveBeenCalledWith('stored-hash', 'correct-horse-battery');
  });

  it('returns the public user and fresh tokens, never the password hash', async () => {
    const result = await login(credentials);

    expect(result).toEqual({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada', createdAt: stored.createdAt },
      accessToken: 'access:u1',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });
    expect(JSON.stringify(result)).not.toContain('stored-hash');
  });

  it('starts a new session family and stores only the hashed refresh token, valid for 7 days', async () => {
    await login(credentials);

    expect(mocks.tokenCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        familyId: expect.stringMatching(UUID),
        tokenHash: 'hash:new-refresh', // never the raw token
        expiresAt: new Date(NOW.getTime() + 7 * DAY),
      },
    });
  });

  it('answers 401 and issues no tokens for a wrong password', async () => {
    mocks.verify.mockResolvedValue(false);

    await expect(login(credentials)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
  });

  it('for an unknown email still spends time on a dummy password check, then answers 401', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.verify.mockResolvedValue(false);

    await expect(login(credentials)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.verify).toHaveBeenCalledWith('dummy-hash', 'correct-horse-battery');
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
  });

  it('gives the identical error for an unknown email and a wrong password, so accounts cannot be enumerated', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.verify.mockResolvedValue(false);
    const unknownEmail = await failure(login(credentials));

    mocks.userFindUnique.mockResolvedValue(stored);
    const wrongPassword = await failure(login(credentials));

    expect(unknownEmail.message).toBe(wrongPassword.message);
    expect(unknownEmail).toMatchObject({ statusCode: 401 });
  });
});

describe('refresh', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'rt1',
    userId: 'u1',
    familyId: 'fam1',
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    ...overrides,
  });

  it('looks the token up by its hash, never by the raw value', async () => {
    mocks.tokenFindUnique.mockResolvedValue(null);
    await failure(refresh('raw-token'));
    expect(mocks.tokenFindUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash:raw-token' } });
  });

  it('answers 401 for an unknown token and changes nothing', async () => {
    mocks.tokenFindUnique.mockResolvedValue(null);

    await expect(refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid refresh token',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });

  it('rotates: revokes the old token and issues a new one in the same family, in one transaction', async () => {
    mocks.tokenFindUnique.mockResolvedValue(row());
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({});

    const result = await refresh('raw-token');

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revokedAt: null },
      data: { revokedAt: NOW },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        familyId: 'fam1', // same session
        tokenHash: 'hash:new-refresh',
        expiresAt: new Date(NOW.getTime() + 7 * DAY),
      },
    });
    expect(tx.refreshToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.refreshToken.create.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ accessToken: 'access:u1', refreshToken: 'new-refresh', expiresIn: 900 });
  });

  it('treats a revoked token as stolen: revokes the whole family and answers 401', async () => {
    mocks.tokenFindUnique.mockResolvedValue(row({ revokedAt: new Date(NOW.getTime() - 1000) }));
    mocks.tokenUpdateMany.mockResolvedValue({ count: 2 });

    await expect(refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/reuse detected/i),
    });
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1', revokedAt: null },
      data: { revokedAt: NOW },
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // nothing new is issued
  });

  it('answers 401 for an expired token without revoking or issuing anything', async () => {
    mocks.tokenFindUnique.mockResolvedValue(row({ expiresAt: new Date(NOW.getTime() - 1) }));

    await expect(refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Refresh token expired',
    });
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('answers 401 and issues nothing when a concurrent request already used the token', async () => {
    mocks.tokenFindUnique.mockResolvedValue(row());
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 }); // lost the race

    await expect(refresh('raw-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Refresh token already used',
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('revokes the matching token if it is still active', async () => {
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });

    await logout('raw-token');

    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: { tokenHash: 'hash:raw-token', revokedAt: null },
      data: { revokedAt: NOW },
    });
  });

  it('succeeds quietly for an unknown or already revoked token', async () => {
    mocks.tokenUpdateMany.mockResolvedValue({ count: 0 });
    await expect(logout('whatever')).resolves.toBeUndefined();
  });
});

describe('getMe', () => {
  it('returns only the public fields', async () => {
    const user = { id: 'u1', email: 'ada@example.com', name: 'Ada', createdAt: new Date() };
    mocks.userFindUnique.mockResolvedValue(user);

    expect(await getMe('u1')).toEqual(user);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  });

  it('answers 401 when the account no longer exists', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(getMe('ghost')).rejects.toMatchObject({ statusCode: 401 });
  });
});