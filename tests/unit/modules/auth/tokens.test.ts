import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';

const secrets = vi.hoisted(() => ({ access: 'a'.repeat(40), refresh: 'r'.repeat(40) }));
vi.mock('../../../../src/config/env.js', () => ({
  env: {
    JWT_ACCESS_SECRET: secrets.access,
    JWT_REFRESH_SECRET: secrets.refresh,
    ACCESS_TOKEN_TTL_SECONDS: 900,
  },
}));

import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../../../../src/modules/auth/tokens.js';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

afterEach(() => {
  vi.useRealTimers();
});

describe('access tokens', () => {
  it('round-trips: a signed token verifies back to the same user id', () => {
    expect(verifyAccessToken(signAccessToken('user-1'))).toBe('user-1');
  });

  it('is an HS256 JWT carrying only sub, iat and exp', () => {
    const decoded = jwt.decode(signAccessToken('user-1'), { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    expect(Object.keys(decoded!.payload as object).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('lives for exactly the configured 15 minutes', () => {
    const { exp, iat } = jwt.decode(signAccessToken('user-1')) as { exp: number; iat: number };
    expect(exp - iat).toBe(900);
  });

  it('is accepted just before expiry and rejected just after', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    const token = signAccessToken('user-1');

    vi.setSystemTime(new Date('2026-11-10T10:14:59Z'));
    expect(verifyAccessToken(token)).toBe('user-1');

    vi.setSystemTime(new Date('2026-11-10T10:15:01Z'));
    expect(() => verifyAccessToken(token)).toThrow(/expired/);
  });

  it('rejects a token whose payload was swapped under the original signature', () => {
    const [header, , signature] = signAccessToken('user-1').split('.');
    const forged = `${header}.${b64({ sub: 'admin', exp: 9_999_999_999 })}.${signature}`;
    expect(() => verifyAccessToken(forged)).toThrow(/signature/);
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({}, 'x'.repeat(40), { subject: 'user-1', expiresIn: 60 });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('rejects a token signed with the refresh secret, so the two secrets cannot be swapped', () => {
    const token = jwt.sign({}, secrets.refresh, { subject: 'user-1', expiresIn: 60 });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('rejects an unsigned token that claims alg "none"', () => {
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'user-1', exp: 9_999_999_999 })}.`;
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });

  it('rejects a validly signed token that has no subject', () => {
    const token = jwt.sign({}, secrets.access, { algorithm: 'HS256', expiresIn: 60 });
    expect(() => verifyAccessToken(token)).toThrow('Invalid token payload');
  });

  it.each(['', 'garbage', 'a.b.c'])('rejects the malformed token %j', (token) => {
    expect(() => verifyAccessToken(token)).toThrow();
  });
});

describe('refresh tokens', () => {
  it('are 64 URL-safe characters (48 random bytes)', () => {
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('never repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('hashRefreshToken', () => {
  it('is an HMAC-SHA256 keyed with the refresh secret, as 64 hex characters', () => {
    const expected = createHmac('sha256', secrets.refresh).update('raw-token').digest('hex');
    expect(hashRefreshToken('raw-token')).toBe(expected);
    expect(hashRefreshToken('raw-token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, and different for different tokens', () => {
    expect(hashRefreshToken('a')).toBe(hashRefreshToken('a'));
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'));
  });

  it('does not contain the raw token', () => {
    expect(hashRefreshToken('raw-token')).not.toContain('raw-token');
  });
});