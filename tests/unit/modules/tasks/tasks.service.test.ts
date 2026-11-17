import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  membership: { findUnique: vi.fn() },
  task: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  queryRaw: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.queryRaw,
    task: { findFirst: mocks.taskFindFirst, findMany: mocks.taskFindMany },
  },
}));
vi.mock('../../../../src/modules/audit/audit.recorder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/modules/audit/audit.recorder.js')>()),
  recordAudit: mocks.recordAudit,
}));

import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from '../../../../src/modules/tasks/tasks.service.js';
import type { ListTasksQuery } from '../../../../src/modules/tasks/tasks.schema.js';

const ctx = { userId: 'u1', requestId: 'req-1' };
const NOW = new Date('2026-11-10T10:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTask', () => {
  const input = { projectId: 'p1', title: 'Fix login', assigneeId: 'u2' };

  beforeEach(() => {
    tx.project.findFirst.mockResolvedValue({ id: 'p1' });
    tx.membership.findUnique.mockResolvedValue({ id: 'm2' });
    tx.task.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 't1', ...data }));
  });

  it("checks that the project belongs to the caller's organization", async () => {
    await createTask(ctx, 'org1', ctx.userId, input);
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org1' },
      select: { id: true },
    });
  });

  it('checks that the assignee is a member of the same organization', async () => {
    await createTask(ctx, 'org1', ctx.userId,  input);
    expect(tx.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u2', organizationId: 'org1' } },
      select: { id: true },
    });
  });

  it('skips the assignee check for an unassigned task', async () => {
    await createTask(ctx, 'org1', ctx.userId, { projectId: 'p1', title: 'No owner yet' });
    expect(tx.membership.findUnique).not.toHaveBeenCalled();
  });

  it('stamps the task with the verified organization and creator', async () => {
    await createTask(ctx, 'org1', ctx.userId,  input);
    expect(tx.task.create).toHaveBeenCalledWith({
      data: { ...input, organizationId: 'org1', createdById: 'u1' },
    });
  });

  it('cannot be redirected to another organization through the input', async () => {
    const hostile = { ...input, organizationId: 'org-evil', createdById: 'u-evil' };

    await createTask(ctx, 'org1', ctx.userId,  hostile);

    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      organizationId: 'org1',
      createdById: 'u1',
    });
  });

  it('records the creation with the full new row', async () => {
    await createTask(ctx, 'org1', ctx.userId,  input);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        organizationId: 'org1',
        action: 'task.created',
        entityType: 'task',
        entityId: 't1',
        after: expect.objectContaining({ title: 'Fix login' }),
      }),
    );
  });

  it('answers 404 and creates nothing when the project belongs to another organization', async () => {
    tx.project.findFirst.mockResolvedValue(null);

    await expect(createTask(ctx, 'org1', ctx.userId,  input)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(tx.task.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers 400 and creates nothing when the assignee is not a member', async () => {
    tx.membership.findUnique.mockResolvedValue(null);

    await expect(createTask(ctx, 'org1', ctx.userId,  input)).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});

describe('getTask', () => {
  it('finds a task only inside the given organization', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1' });

    expect(await getTask('org1', 't1')).toEqual({ id: 't1' });
    expect(mocks.taskFindFirst).toHaveBeenCalledWith({ where: { id: 't1', organizationId: 'org1' } });
  });

  it("answers 404 for a task that is missing or belongs to another organization", async () => {
    mocks.taskFindFirst.mockResolvedValue(null);
    await expect(getTask('org1', 't1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateTask', () => {
  const before = { id: 't1', title: 'Old', status: 'TODO', updatedAt: new Date('2026-01-01') };

  it('updates inside the organization and records only the changed fields', async () => {
    tx.task.findFirst.mockResolvedValue(before);
    tx.task.update.mockResolvedValue({ ...before, status: 'DONE', updatedAt: NOW });

    await updateTask(ctx, 'org1', 't1', { status: 'DONE' });

    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 't1', organizationId: 'org1' },
      data: { status: 'DONE' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({
        action: 'task.updated',
        before: { status: 'TODO' },
        after: { status: 'DONE' },
      }),
    );
  });

  it('writes no audit entry when nothing really changed', async () => {
    tx.task.findFirst.mockResolvedValue(before);
    tx.task.update.mockResolvedValue({ ...before, updatedAt: NOW });

    await updateTask(ctx, 'org1', 't1', { status: 'TODO' });

    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('answers 404 and updates nothing for a task of another organization', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await expect(updateTask(ctx, 'org1', 't1', { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('refuses to assign the task to someone outside the organization', async () => {
    tx.membership.findUnique.mockResolvedValue(null);

    await expect(updateTask(ctx, 'org1', 't1', { assigneeId: 'u-outsider' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('lets a task be unassigned without any membership lookup', async () => {
    tx.task.findFirst.mockResolvedValue({ ...before, assigneeId: 'u2' });
    tx.task.update.mockResolvedValue({ ...before, assigneeId: null });

    await updateTask(ctx, 'org1', 't1', { assigneeId: null });

    expect(tx.membership.findUnique).not.toHaveBeenCalled();
    expect(tx.task.update).toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  it('deletes inside the organization and keeps a snapshot in the audit log', async () => {
    const row = { id: 't1', title: 'Gone' };
    tx.task.findFirst.mockResolvedValue(row);

    await deleteTask(ctx, 'org1', 't1');

    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: 't1', organizationId: 'org1' } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      ctx,
      expect.objectContaining({ action: 'task.deleted', entityId: 't1', before: row }),
    );
  });

  it('answers 404 and deletes nothing for a task of another organization', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await expect(deleteTask(ctx, 'org1', 't1')).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });
});

describe('listTasks', () => {
  const query = (overrides: Partial<ListTasksQuery> = {}): ListTasksQuery => ({
    limit: 20,
    sortBy: 'createdAt',
    order: 'desc',
    ...overrides,
  });
  const lastCall = () => mocks.taskFindMany.mock.calls.at(-1)![0];

  beforeEach(() => {
    mocks.taskFindMany.mockResolvedValue([]);
  });

  it('with no filters, only scopes by organization', async () => {
    await listTasks('org1', 'u1', query());
    expect(lastCall().where).toEqual({ organizationId: 'org1', AND: [] });
  });

  it('always keeps the organization filter, whatever else is requested', async () => {
    await listTasks('org1', 'u1', query({ projectId: 'p1', status: 'DONE', priority: 'HIGH' }));
    expect(lastCall().where).toMatchObject({
      organizationId: 'org1',
      projectId: 'p1',
      status: 'DONE',
      priority: 'HIGH',
    });
  });

  it.each([
    ['me', { assigneeId: 'u1' }],
    ['unassigned', { assigneeId: null }],
    ['u-7', { assigneeId: 'u-7' }],
  ])('turns the assignee filter "%s" into %j', async (assignee, expected) => {
    await listTasks('org1', 'u1', query({ assignee }));
    expect(lastCall().where).toMatchObject(expected);
  });

  it('turns due date bounds into range conditions', async () => {
    const after = new Date('2026-01-01');
    const before = new Date('2026-12-31');

    await listTasks('org1', 'u1', query({ dueAfter: after, dueBefore: before }));

    expect(lastCall().where.AND).toEqual([
      { dueDate: { gte: after } },
      { dueDate: { lte: before } },
    ]);
  });

  it('defines "overdue" as past its due date and not DONE', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    await listTasks('org1', 'u1', query({ overdue: true }));

    expect(lastCall().where.AND).toEqual([{ dueDate: { lt: NOW }, status: { not: 'DONE' } }]);
  });

  it('adds no overdue condition for overdue=false', async () => {
    await listTasks('org1', 'u1', query({ overdue: false }));
    expect(lastCall().where.AND).toEqual([]);
  });

  it('searches through the full-text index, scoped to the organization', async () => {
    mocks.queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await listTasks('org1', 'u1', query({ search: 'login bug' }));

    // Tagged template: the first argument is the SQL text, the rest are the bound values
    expect(mocks.queryRaw.mock.calls[0].slice(1)).toEqual(['org1', 'login bug']);
    expect(lastCall().where.AND).toContainEqual({ id: { in: ['a', 'b'] } });
    // If you kept the ILIKE version instead, expect this condition in AND:
    // { OR: [{ title: { contains: 'login bug', mode: 'insensitive' } }, { description: { ... } }] }
  });

  it('sorts with the chosen field and direction, using id as a tie-breaker in the same direction', async () => {
    await listTasks('org1', 'u1', query());
    expect(lastCall().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

    await listTasks('org1', 'u1', query({ sortBy: 'dueDate', order: 'asc' }));
    expect(lastCall().orderBy).toEqual([{ dueDate: 'asc' }, { id: 'asc' }]);
  });

  it('fetches one extra row, to learn whether another page exists', async () => {
    await listTasks('org1', 'u1', query({ limit: 5 }));
    expect(lastCall().take).toBe(6);
  });

  it('starts after the cursor row, but only when a cursor is given', async () => {
    await listTasks('org1', 'u1', query({ cursor: 'cursor-id' }));
    expect(lastCall()).toMatchObject({ cursor: { id: 'cursor-id' }, skip: 1 });

    await listTasks('org1', 'u1', query());
    expect(lastCall()).not.toHaveProperty('cursor');
    expect(lastCall()).not.toHaveProperty('skip');
  });

  it('trims the extra row and returns a cursor pointing at the last task shown', async () => {
    mocks.taskFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    expect(await listTasks('org1', 'u1', query({ limit: 2 }))).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: { limit: 2, hasMore: true, nextCursor: 'b' },
    });
  });
});