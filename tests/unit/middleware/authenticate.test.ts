import { beforeEach, describe, expect, it, vi } from 'vitest';

const verify = vi.hoisted(() => vi.fn());
vi.mock('../../../src/modules/auth/tokens.js', () => ({ verifyAccessToken: verify }));

import { authenticate } from '../../../src/middleware/authenticate.js';
import { mockReq, mockRes } from '../helpers/http.js';

function run(authorization?: string) {
  const req = mockReq({ headers: authorization === undefined ? {} : { authorization } });
  const next = vi.fn();
  authenticate(req, mockRes(), next);
  return { req, next };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('authenticate', () => {
  it('sets req.user from a valid Bearer token and continues without an error', () => {
    verify.mockReturnValue('user-1');

    const { req, next } = run('Bearer good.token.here');

    expect(verify).toHaveBeenCalledWith('good.token.here'); // the "Bearer " prefix is stripped
    expect(req.user).toEqual({ id: 'user-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('answers 401 "Authentication required" when the header is missing', () => {
    const { req, next } = run();

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    expect(req.user).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['', 'Bearer', 'Basic dXNlcjpwYXNz', 'bearer lowercase.token', 'just-a-token'])(
    'answers 401 "Authentication required" for the header %j, without verifying anything',
    (header) => {
      const { next } = run(header);
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, message: 'Authentication required' });
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it('answers 401 "Invalid or expired token" when verification fails, and sets no user', () => {
    verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const { req, next } = run('Bearer stale.token.here');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired token',
    });
    expect(req.user).toBeUndefined();
  });

  it('gives the same answer for every kind of bad token, so attackers learn nothing', () => {
    const messages = ['jwt expired', 'invalid signature', 'jwt malformed'].map((reason) => {
      verify.mockImplementation(() => {
        throw new Error(reason);
      });
      return run('Bearer x.y.z').next.mock.calls[0][0].message;
    });

    expect(new Set(messages)).toEqual(new Set(['Invalid or expired token']));
  });
});