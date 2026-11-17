import { describe, expect, it } from 'vitest';
import type { Role } from '../../../../src/generated/prisma/client.js';
import {
  hasPermission,
  rolePermissions,
  type Permission,
} from '../../../../src/modules/rbac/permissions.js';

const ROLES: Role[] = ['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'];

// Read each row as: this permission is held by VIEWER, MEMBER, ADMIN, OWNER
const MATRIX: [Permission, boolean, boolean, boolean, boolean][] = [
  ['org:read', true, true, true, true],
  ['member:read', true, true, true, true],
  ['project:read', true, true, true, true],
  ['task:read', true, true, true, true],
  ['task:write', false, true, true, true],
  ['project:write', false, false, true, true],
  ['org:update', false, false, true, true],
  ['member:manage', false, false, true, true],
  ['audit:read', false, false, true, true],
  ['org:delete', false, false, false, true],
];

describe('permission matrix', () => {
  it.each(MATRIX)('%s -> viewer:%s member:%s admin:%s owner:%s', (permission, ...expected) => {
    ROLES.forEach((role, i) => {
      expect(hasPermission(role, permission), `${role} / ${permission}`).toBe(expected[i]);
    });
  });

  it('lists every permission that exists, so a new permission cannot ship untested', () => {
    const existing = new Set(Object.values(rolePermissions).flat());
    expect(MATRIX.map(([permission]) => permission).sort()).toEqual([...existing].sort());
  });

  it('gives OWNER every permission', () => {
    const existing = new Set(Object.values(rolePermissions).flat());
    expect(new Set(rolePermissions.OWNER)).toEqual(existing);
  });

  it('never gives a lower role something a higher role lacks', () => {
    for (let i = 0; i < ROLES.length - 1; i++) {
      for (const permission of rolePermissions[ROLES[i]]) {
        expect(hasPermission(ROLES[i + 1], permission), `${ROLES[i + 1]} / ${permission}`).toBe(true);
      }
    }
  });

  it('denies a permission that does not exist, even to the owner', () => {
    expect(hasPermission('OWNER', 'nonsense:permission' as Permission)).toBe(false);
  });
});