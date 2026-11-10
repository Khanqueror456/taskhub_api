import { describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({ REDIS_URL: 'redis://localhost:6379' }));
vi.mock('../../../src/config/env.js', () => ({ env: mockEnv }));

import { bullConnection } from '../../../src/jobs/connection.js';

function connect(url: string, role: 'producer' | 'worker' = 'producer') {
  mockEnv.REDIS_URL = url;
  return bullConnection(role);
}

describe('bullConnection', () => {
  it('reads host and port from the URL and defaults to database 0 without credentials', () => {
    expect(connect('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
      enableOfflineQueue: false,
    });
  });

  it('reads username, decoded password, port and database number', () => {
    expect(connect('redis://app:p%40ss@redis.internal:6380/3')).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      username: 'app',
      password: 'p@ss',
      db: 3,
    });
  });

  it('falls back to port 6379 when the URL has none', () => {
    expect(connect('redis://cache.local')).toMatchObject({ host: 'cache.local', port: 6379 });
  });

  it('treats a bare trailing slash as database 0', () => {
    expect(connect('redis://localhost:6379/')).toMatchObject({ db: 0 });
  });

  it('enables TLS only for rediss:// URLs', () => {
    expect(connect('rediss://secure.example:6380')).toMatchObject({ tls: {} });
    expect(connect('redis://localhost:6379')).not.toHaveProperty('tls');
  });

  it('makes producers fail fast when Redis is down', () => {
    const conn = connect('redis://localhost:6379', 'producer');
    expect(conn).toMatchObject({ enableOfflineQueue: false });
    expect(conn).not.toHaveProperty('maxRetriesPerRequest');
  });

  it('makes workers wait for Redis forever, as BullMQ requires', () => {
    const conn = connect('redis://localhost:6379', 'worker');
    expect(conn).toMatchObject({ maxRetriesPerRequest: null });
    expect(conn).not.toHaveProperty('enableOfflineQueue');
  });
});