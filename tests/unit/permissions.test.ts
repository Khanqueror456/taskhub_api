import { describe, expect, it } from 'vitest';
import { hasPermission, rolePermissions } from '../../src/modules/rbac/permissions.js';

describe('permissions map', () => {
  it('gives VIEWER no write access', () => {
    expect(hasPermission('VIEWER', 'task:write')).toBe(false);
    expect(hasPermission('VIEWER', 'task:read')).toBe(true);
  });

  it('keeps org deletion exclusive to OWNER', () => {
    expect(hasPermission('ADMIN', 'org:delete')).toBe(false);
    expect(hasPermission('OWNER', 'org:delete')).toBe(true);
  });

  it('never grants a lower role something a higher role lacks', () => {
    const order = ['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'] as const;
    for (let i = 0; i < order.length - 1; i++) {
      for (const p of rolePermissions[order[i]]) {
        expect(hasPermission(order[i + 1], p)).toBe(true);
      }
    }
  });

  it('lets ADMIN update the org and manage members', () => {
  expect(hasPermission('ADMIN', 'org:update')).toBe(true);
  expect(hasPermission('ADMIN', 'member:manage')).toBe(true);
});
});