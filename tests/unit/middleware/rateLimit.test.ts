import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ evalFn: vi.fn(), env: { RATE_LIMIT_ENABLED: true } }));
vi.mock('../../../src/config/env.js', () => ({ env: mocks.env }));
vi.mock('../../../src/lib/redis.js', () => ({ redis: { eval: mocks.evalFn } }));

import { rateLimit, type RateLimitOptions } from '../../../src/middleware/rateLimit.js';
import { mockReq, mockRes } from '../helpers/http.js';

async function run(overrides: Partial<RateLimitOptions> = {}) {
  const limiter = rateLimit({
    name: 'login',
    limit: 3,
    windowSeconds: 60,
    key: (req) => req.ip,
    ...overrides,
  });
  const req = mockReq();
  const res = mockRes();
  const next = vi.fn();
  await limiter(req, res, next);
  return { req, res, next };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.RATE_LIMIT_ENABLED = true;
  mocks.evalFn.mockResolvedValue([1, 60]);
});

describe('rateLimit', () => {
  it('asks Redis to count this hit under "rl:<name>:<id>" for the configured window', async () => {
    await run();
    expect(mocks.evalFn).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'rl:login:203.0.113.7',
      60,
    );
  });

  it('lets a request through under the limit and reports the remaining budget', async () => {
    mocks.evalFn.mockResolvedValue([1, 55]);

    const { res, next } = await run();

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', 3);
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 2);
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', 55);
    expect(next).toHaveBeenCalledWith();
  });

  it('still allows the request that uses the last of the budget', async () => {
    mocks.evalFn.mockResolvedValue([3, 10]);

    const { res, next } = await run();

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 0);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks the first request over the limit with a 429 and Retry-After', async () => {
    mocks.evalFn.mockResolvedValue([4, 42]);

    const { res, next } = await run();

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 42);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });

  it('never reports a negative budget or a retry time below one second', async () => {
    mocks.evalFn.mockResolvedValue([9, -1]); // -1: the key had no expiry yet

    const { res } = await run();

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 0);
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', 0);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 1);
  });

  it('skips requests that have no identity to limit', async () => {
    const { next } = await run({ key: () => undefined });
    expect(mocks.evalFn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('does nothing when rate limiting is switched off in the environment', async () => {
    mocks.env.RATE_LIMIT_ENABLED = false;

    const { next } = await run();

    expect(mocks.evalFn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('lets the enabled option override the environment in both directions', async () => {
    mocks.env.RATE_LIMIT_ENABLED = false;
    await run({ enabled: true });
    expect(mocks.evalFn).toHaveBeenCalledTimes(1);

    mocks.env.RATE_LIMIT_ENABLED = true;
    await run({ enabled: false });
    expect(mocks.evalFn).toHaveBeenCalledTimes(1); // unchanged
  });

  it('fails open: when Redis errors, the request passes and the problem is logged', async () => {
    mocks.evalFn.mockRejectedValue(new Error('redis down'));

    const { req, res, next } = await run();

    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(req.log.warn).toHaveBeenCalled();
  });
});