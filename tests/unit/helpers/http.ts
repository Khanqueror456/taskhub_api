import type { Request, Response } from 'express';
import { vi } from 'vitest';

/** A fake request. Override only what the test cares about. */
export function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    id: 'req-test-id',
    ip: '203.0.113.7',
    method: 'GET',
    path: '/test',
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

/** A fake response whose methods record their calls and can be chained. */
export function mockRes() {
  const res = { status: vi.fn(), json: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res as typeof res & Response;
}