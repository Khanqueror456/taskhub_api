import { describe, expect, it, vi } from 'vitest';
import {
  auditContext,
  changedFields,
  recordAudit,
} from '../../../../src/modules/audit/audit.recorder.js';
import { mockReq } from '../../helpers/http.js';

describe('changedFields', () => {
  it('returns null when nothing changed', () => {
    expect(changedFields({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull();
  });

  it('returns only the fields that differ, with their old and new values', () => {
    const before = { status: 'TODO', title: 'T', priority: 'LOW' };
    const after = { status: 'DONE', title: 'T', priority: 'LOW' };
    expect(changedFields(before, after)).toEqual({
      before: { status: 'TODO' },
      after: { status: 'DONE' },
    });
  });

  it('ignores updatedAt, because it changes on every save', () => {
    const before = { title: 'T', updatedAt: new Date('2026-01-01') };
    const after = { title: 'T', updatedAt: new Date('2026-02-02') };
    expect(changedFields(before, after)).toBeNull();
  });

  it('can be told to ignore other fields', () => {
    expect(changedFields({ a: 1, b: 1 }, { a: 2, b: 2 }, ['a'])).toEqual({
      before: { b: 1 },
      after: { b: 2 },
    });
  });

  it('compares dates by value and records changes to and from null', () => {
    const before = { dueDate: new Date('2026-01-01'), assigneeId: null };
    const after = { dueDate: new Date('2026-01-01'), assigneeId: 'u2' };
    expect(changedFields(before, after)).toEqual({
      before: { assigneeId: null },
      after: { assigneeId: 'u2' },
    });
  });

  it('detects a changed date', () => {
    const diff = changedFields({ dueDate: new Date('2026-01-01') }, { dueDate: new Date('2026-01-02') });
    expect(diff).not.toBeNull();
  });

  it('only looks at fields that exist in the new row', () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1 })).toBeNull();
  });
});

describe('recordAudit', () => {
  const create = vi.fn();
  const tx = { auditLog: { create } } as unknown as Parameters<typeof recordAudit>[0];
  const ctx = { userId: 'u1', requestId: 'req-1', ip: '1.2.3.4', userAgent: 'vitest' };

  it('writes one audit row containing who, what, which entity, and where the request came from', async () => {
    await recordAudit(tx, ctx, {
      organizationId: 'org1',
      action: 'task.updated',
      entityType: 'task',
      entityId: 't1',
      before: { status: 'TODO' },
      after: { status: 'DONE' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org1',
        actorId: 'u1',
        action: 'task.updated',
        entityType: 'task',
        entityId: 't1',
        before: { status: 'TODO' },
        after: { status: 'DONE' },
        requestId: 'req-1',
        ip: '1.2.3.4',
        userAgent: 'vitest',
      },
    });
  });

  it('turns Date values into ISO strings, which JSON columns can store', async () => {
    await recordAudit(tx, ctx, {
      organizationId: 'org1',
      action: 'task.created',
      entityType: 'task',
      entityId: 't1',
      after: { dueDate: new Date('2026-01-01T00:00:00Z') },
    });

    expect(create.mock.calls.at(-1)![0].data.after).toEqual({ dueDate: '2026-01-01T00:00:00.000Z' });
  });

  it('leaves before and after empty when they are not given', async () => {
    await recordAudit(tx, ctx, {
      organizationId: 'org1',
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: 'i1',
    });

    const { data } = create.mock.calls.at(-1)![0];
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
  });
});

describe('auditContext', () => {
  it('builds the context from the request: user, request id, IP and user agent', () => {
    const req = mockReq({
      user: { id: 'u1' },
      id: 42, // pino-http ids can be numbers
      ip: '203.0.113.9',
      headers: { 'user-agent': 'PostmanRuntime/7' },
    });

    expect(auditContext(req)).toEqual({
      userId: 'u1',
      requestId: '42',
      ip: '203.0.113.9',
      userAgent: 'PostmanRuntime/7',
    });
  });
});