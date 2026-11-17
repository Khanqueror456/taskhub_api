import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  organization: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  membership: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  task: { updateMany: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  orgFindUnique: vi.fn(),
  membershipFindMany: vi.fn(),
  recordAudit: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: { findUnique: mocks.userFindUnique },
    organization: { findUnique: mocks.orgFindUnique },
    membership: { findMany: mocks.membershipFindMany },
  },
}));
// Keep the real changedFields, replace only the database write
vi.mock('../../../../src/modules/audit/audit.recorder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/modules/audit/audit.recorder.js')>()),
  recordAudit: mocks.recordAudit,
}));
vi.mock('../../../../src/modules/rbac/membershipCache.js', () => ({
  invalidateMemberships: mocks.invalidate,
}));

import { Prisma } from '../../../../src/generated/prisma/client.js';
import {
  addMember,
  createOrganization,
  deleteOrganization,
  getOrganization,
  listMembers,
  listMyOrganizations,
  removeMember,
  updateMemberRole,
  updateOrganization,
} from '../../../../src/modules/organizations/organizations.service.js';

const ctx = { userId: 'u1', requestId: 'req-1' };
const createdAt = new Date('2026-01-01T00:00:00Z');
const memberRow = (role: string) => ({
  role,
  createdAt,
  user: { id: 'u2', email: 'bob@example.com', name: 'Bob' },
});
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('createOrganization', () => {
  beforeEach(() => {
    tx.organization.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'org1',
      ...data,
      createdAt,
    }));
    tx.membership.create.mockResolvedValue({});
  });

  it('creates the organization and makes the creator its OWNER, in one transaction', async () => {
    const result = await createOrganization(ctx, ctx.userId, 'Acme Inc');

    expect(tx.membership.create).toHaveBeenCalledWith({
      data: { userId: 'u1', organizationId: 'org1', role: 'OWNER' },
    });
    expect(result).toMatchObject({ id: 'org1', name: 'Acme Inc', role: 'OWNER' });
  });

  it('records the creation in the audit log', async () => {
    await createOrganization(ctx, ctx.userId, 'Acme Inc');

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        organizationId: 'org1',
        action: 'org.created',
        entityType: 'organization',
        entityId: 'org1',
      }),
    );
  });

  it.each([
    ['Acme Inc', /^acme-inc-[0-9a-f]{6}$/],
    ['  Hello, World!!  ', /^hello-world-[0-9a-f]{6}$/],
    ['Café Olé', /^cafe-ole-[0-9a-f]{6}$/],
    ['こんにちは', /^org-[0-9a-f]{6}$/],
    ['x'.repeat(60), /^x{40}-[0-9a-f]{6}$/],
  ])('turns the name %j into a URL-safe slug', async (name, pattern) => {
    await createOrganization(ctx, ctx.userId, name);
    expect(tx.organization.create.mock.calls[0][0].data.slug).toMatch(pattern);
  });

  it('gives two organizations with the same name different slugs', async () => {
    await createOrganization(ctx, ctx.userId, 'Acme');
    await createOrganization(ctx, ctx.userId, 'Acme');
    const [first, second] = tx.organization.create.mock.calls.map(([arg]) => arg.data.slug);
    expect(first).not.toBe(second);
  });
});

describe('reading organizations', () => {
  it("lists the user's organizations together with their role in each", async () => {
    mocks.membershipFindMany.mockResolvedValue([
      { role: 'OWNER', organization: { id: 'org1', name: 'Acme' } },
      { role: 'VIEWER', organization: { id: 'org2', name: 'Globex' } },
    ]);

    expect(await listMyOrganizations('u1')).toEqual([
      { id: 'org1', name: 'Acme', role: 'OWNER' },
      { id: 'org2', name: 'Globex', role: 'VIEWER' },
    ]);
    expect(mocks.membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('returns an organization, or answers 404', async () => {
    mocks.orgFindUnique.mockResolvedValueOnce({ id: 'org1', name: 'Acme' });
    expect(await getOrganization('org1')).toEqual({ id: 'org1', name: 'Acme' });

    mocks.orgFindUnique.mockResolvedValueOnce(null);
    await expect(getOrganization('missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists an organization's members in a flat, public shape", async () => {
    mocks.membershipFindMany.mockResolvedValue([memberRow('MEMBER')]);

    expect(await listMembers('org1')).toEqual([
      { userId: 'u2', email: 'bob@example.com', name: 'Bob', role: 'MEMBER', joinedAt: createdAt },
    ]);
    expect(mocks.membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    );
  });
});

describe('updateOrganization', () => {
  it('records only what changed', async () => {
    tx.organization.findUnique.mockResolvedValue({ id: 'org1', name: 'Old', updatedAt: createdAt });
    tx.organization.update.mockResolvedValue({ id: 'org1', name: 'New', updatedAt: new Date() });

    await updateOrganization(ctx, 'org1', 'New');

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'org.updated',
        before: { name: 'Old' },
        after: { name: 'New' },
      }),
    );
  });

  it('writes no audit entry when the name is unchanged', async () => {
    const row = { id: 'org1', name: 'Same', updatedAt: createdAt };
    tx.organization.findUnique.mockResolvedValue(row);
    tx.organization.update.mockResolvedValue(row);

    await updateOrganization(ctx, 'org1', 'Same');

    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers 404 and changes nothing for an organization that does not exist', async () => {
    tx.organization.findUnique.mockResolvedValue(null);

    await expect(updateOrganization(ctx, 'org1', 'New')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.organization.update).not.toHaveBeenCalled();
  });
});

describe('deleteOrganization', () => {
  beforeEach(() => {
    tx.organization.findUnique.mockResolvedValue({ id: 'org1', name: 'Acme' });
    tx.membership.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
  });

  it('deletes the organization and keeps a snapshot of it in the audit log', async () => {
    await deleteOrganization(ctx, 'org1');

    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: 'org1' } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'org.deleted',
        before: { id: 'org1', name: 'Acme' },
      }),
    );
  });

  it("clears every member's cached membership, but only after the transaction commits", async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
      const result = await fn(tx);
      order.push('commit');
      return result;
    });
    mocks.invalidate.mockImplementation(async () => {
      order.push('invalidate');
    });

    await deleteOrganization(ctx, 'org1');

    expect(mocks.invalidate).toHaveBeenCalledWith('org1', ['u1', 'u2']);
    expect(order).toEqual(['commit', 'invalidate']);
  });

  it('answers 404 and invalidates nothing when the organization does not exist', async () => {
    tx.organization.findUnique.mockResolvedValue(null);

    await expect(deleteOrganization(ctx, 'org1')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.organization.delete).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});

describe('addMember', () => {
  const input = { email: 'bob@example.com', role: 'MEMBER' as const };

  it('adds a registered user with the given role and records it', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u2' });
    tx.membership.create.mockResolvedValue(memberRow('MEMBER'));

    const result = await addMember(ctx, 'org1', input);

    expect(tx.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u2', organizationId: 'org1', role: 'MEMBER' } }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'member.added',
        entityType: 'member',
        entityId: 'u2',
        after: { email: 'bob@example.com', role: 'MEMBER' },
      }),
    );
    expect(result).toEqual({
      userId: 'u2',
      email: 'bob@example.com',
      name: 'Bob',
      role: 'MEMBER',
      joinedAt: createdAt,
    });
  });

  it('answers 404 when nobody is registered with that email', async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(addMember(ctx, 'org1', input)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('answers 409 when the user is already a member (unique constraint)', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u2' });
    mocks.transaction.mockRejectedValue(knownError('P2002'));

    await expect(addMember(ctx, 'org1', input)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already a member/),
    });
  });

  it('rethrows any other database error untouched', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u2' });
    mocks.transaction.mockRejectedValue(new Error('db down'));

    await expect(addMember(ctx, 'org1', input)).rejects.toThrow('db down');
  });
});

describe('updateMemberRole', () => {
  it('looks the member up inside this organization only, then changes the role and audits it', async () => {
    tx.membership.findUnique.mockResolvedValue({ id: 'm2', role: 'MEMBER' });
    tx.membership.update.mockResolvedValue(memberRow('ADMIN'));

    const result = await updateMemberRole(ctx, 'org1', 'u2', 'ADMIN');

    expect(tx.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u2', organizationId: 'org1' } },
    });
    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm2' }, data: { role: 'ADMIN' } }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'member.role_changed',
        entityId: 'u2',
        before: { role: 'MEMBER' },
        after: { role: 'ADMIN' },
      }),
    );
    expect(result?.role).toBe('ADMIN');
  });

  it("drops the member's cached membership only after the commit", async () => {
    const order: string[] = [];
    tx.membership.findUnique.mockResolvedValue({ id: 'm2', role: 'MEMBER' });
    tx.membership.update.mockResolvedValue(memberRow('ADMIN'));
    mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
      const result = await fn(tx);
      order.push('commit');
      return result;
    });
    mocks.invalidate.mockImplementation(async () => {
      order.push('invalidate');
    });

    await updateMemberRole(ctx, 'org1', 'u2', 'ADMIN');

    expect(mocks.invalidate).toHaveBeenCalledWith('org1', ['u2']);
    expect(order).toEqual(['commit', 'invalidate']);
  });

  it('writes no audit entry when the role stays the same', async () => {
    tx.membership.findUnique.mockResolvedValue({ id: 'm2', role: 'MEMBER' });
    tx.membership.update.mockResolvedValue(memberRow('MEMBER'));

    await updateMemberRole(ctx, 'org1', 'u2', 'MEMBER');

    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("never changes the owner's role (403), and invalidates nothing", async () => {
    tx.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });

    await expect(updateMemberRole(ctx, 'org1', 'u1', 'VIEWER')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('answers 404 for someone who is not a member of this organization', async () => {
    tx.membership.findUnique.mockResolvedValue(null);

    await expect(updateMemberRole(ctx, 'org1', 'u9', 'ADMIN')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });
});

describe('removeMember', () => {
  beforeEach(() => {
    tx.membership.findUnique.mockResolvedValue({ id: 'm2', role: 'MEMBER' });
    tx.task.updateMany.mockResolvedValue({ count: 2 });
  });

  it("unassigns the member's tasks in this organization, then deletes the membership", async () => {
    await removeMember(ctx, 'org1', 'u2');

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1', assigneeId: 'u2' },
      data: { assigneeId: null },
    });
    expect(tx.membership.delete).toHaveBeenCalledWith({ where: { id: 'm2' } });
    expect(tx.task.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.membership.delete.mock.invocationCallOrder[0],
    );
  });

  it('records the role that was removed and how many tasks were unassigned', async () => {
    await removeMember(ctx, 'org1', 'u2');

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'member.removed',
        entityId: 'u2',
        before: { role: 'MEMBER' },
        after: { unassignedTasks: 2 },
      }),
    );
  });

  it("drops the member's cached membership after the commit", async () => {
    await removeMember(ctx, 'org1', 'u2');
    expect(mocks.invalidate).toHaveBeenCalledWith('org1', ['u2']);
  });

  it('never removes the owner (403) and touches nothing', async () => {
    tx.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });

    await expect(removeMember(ctx, 'org1', 'u1')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.task.updateMany).not.toHaveBeenCalled();
    expect(tx.membership.delete).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('answers 404 for someone who is not a member of this organization', async () => {
    tx.membership.findUnique.mockResolvedValue(null);

    await expect(removeMember(ctx, 'org1', 'u9')).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('answers 409 and creates nothing when the organization already exists', async () => {
  tx.organization.findFirst.mockResolvedValue({ id: 'existing' });

  await expect(createOrganization(ctx, ctx.userId, 'Acme Inc')).rejects.toMatchObject({ statusCode: 409 });
  expect(tx.organization.create).not.toHaveBeenCalled();
  expect(tx.membership.create).not.toHaveBeenCalled();
});
});