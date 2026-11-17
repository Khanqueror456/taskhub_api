import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  task: { findFirst: vi.fn() },
  comment: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  taskFindFirst: vi.fn(),
  commentFindMany: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    task: { findFirst: mocks.taskFindFirst },
    comment: { findMany: mocks.commentFindMany },
  },
}));
vi.mock('../../../../src/modules/audit/audit.recorder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/modules/audit/audit.recorder.js')>()),
  recordAudit: mocks.recordAudit,
}));

import type { Role } from '../../../../src/generated/prisma/client.js';
import {
  createComment,
  deleteComment,
  listComments,
} from '../../../../src/modules/comments/comments.service.js';

const ctx = { userId: 'u1', requestId: 'req-1' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('createComment', () => {
  it('checks the task belongs to the organization, then stores the comment under the caller', async () => {
    tx.task.findFirst.mockResolvedValue({ id: 't1' });
    tx.comment.create.mockResolvedValue({ id: 'c1', body: 'Looks good' });

    await createComment(ctx, 'org1', 't1', ctx.userId, 'Looks good');

    expect(tx.task.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', organizationId: 'org1' },
      select: { id: true },
    });
    expect(tx.comment.create).toHaveBeenCalledWith({
      data: { organizationId: 'org1', taskId: 't1', authorId: 'u1', body: 'Looks good' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({ action: 'comment.created', entityId: 'c1' }),
    );
  });

  it('answers 404 and stores nothing for a task of another organization', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await expect(createComment(ctx, 'org1', 't1', ctx.userId, 'hi')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.comment.create).not.toHaveBeenCalled();
  });
});

describe('listComments', () => {
  const query = (overrides = {}) => ({ limit: 2, ...overrides });

  it('verifies the task is in the organization before reading its comments', async () => {
    mocks.taskFindFirst.mockResolvedValue(null);

    await expect(listComments('org1', 't1', query())).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.commentFindMany).not.toHaveBeenCalled();
  });

  it('lists oldest first, scoped by organization and task, with cursor pagination', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1' });
    mocks.commentFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const result = await listComments('org1', 't1', query({ cursor: 'a0' }));

    expect(mocks.commentFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1', taskId: 't1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 3,
      cursor: { id: 'a0' },
      skip: 1,
    });
    expect(result).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: { limit: 2, hasMore: true, nextCursor: 'b' },
    });
  });
});

describe('deleteComment', () => {
  const comment = (authorId: string) => ({ id: 'c1', taskId: 't1', authorId, body: 'hello' });
  const del = (role: Role) => deleteComment(ctx, 'org1', 't1', 'c1', ctx.userId, role);

  it('looks the comment up by id, task and organization together', async () => {
    tx.comment.findFirst.mockResolvedValue(comment('u1'));

    await del('MEMBER');

    expect(tx.comment.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', taskId: 't1', organizationId: 'org1' },
    });
  });

  it('answers 404 when the comment is not found in that task and organization', async () => {
    tx.comment.findFirst.mockResolvedValue(null);

    await expect(del('OWNER')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.comment.delete).not.toHaveBeenCalled();
  });

  it.each<Role>(['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'])(
    'lets the author delete their own comment, as %s',
    async (role) => {
      tx.comment.findFirst.mockResolvedValue(comment('u1'));

      await del(role);

      expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    },
  );

  it.each<Role>(['ADMIN', 'OWNER'])("lets a %s delete someone else's comment", async (role) => {
    tx.comment.findFirst.mockResolvedValue(comment('u-other'));

    await del(role);

    expect(tx.comment.delete).toHaveBeenCalled();
  });

  it.each<Role>(['VIEWER', 'MEMBER'])(
    "forbids a %s from deleting someone else's comment (403)",
    async (role) => {
      tx.comment.findFirst.mockResolvedValue(comment('u-other'));

      await expect(del(role)).rejects.toMatchObject({ statusCode: 403 });
      expect(tx.comment.delete).not.toHaveBeenCalled();
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    },
  );

  it('keeps the deleted comment in the audit log', async () => {
    const row = comment('u1');
    tx.comment.findFirst.mockResolvedValue(row);

    await del('MEMBER');

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({ action: 'comment.deleted', entityId: 'c1', before: row }),
    );
  });
});