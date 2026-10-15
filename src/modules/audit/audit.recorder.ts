import type { Request } from "express";
import type { Prisma } from "../../generated/prisma/client.js";


export const AUDIT_ENTITY_TYPES = ['organization', 'member', 'project', 'task', 'comment'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditAction =
    | 'org.created' | 'org.updated' | 'org.deleted'
    | 'member.added' | 'member.role_changed' | 'member.removed'
    | 'project.created' | 'project.updated' | 'project.deleted'
    | 'task.created' | 'task.updated' | 'task.deleted'
    | 'comment.created' | 'comment.deleted';


// Who is doing this, and from which request. Build once per request in the controller

export interface AuditContext {
    userId : string;
    requestId?: string;
    ip?: string;
    userAgent?: string;
}

export function auditContext(req : Request) : AuditContext {
    return {
        userId: req.user!.id,
        requestId: String(req.id),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    };
}

interface AuditEntry {
    organizationId : string;
    action : AuditAction;
    entityType : AuditEntityType;
    entityId : string;
    before? : unknown;
    after?: unknown;
}


// Prisma's Json type rejects Date objects, so round-trip through JSON

function toJson(value : unknown) : Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

// Always call this with the `tx` of the transaction that perform the change

export async function recordAudit(tx : Prisma.TransactionClient, ctx : AuditContext, entry : AuditEntry) {
    await tx.auditLog.create({
        data : {
            organizationId : entry.organizationId,
            actorId : ctx.userId,
            action : entry.action,
            entityType : entry.entityType,
            entityId : entry.entityId,
            before : toJson(entry.before),
            after : toJson(entry.after),
            requestId : ctx.requestId,
            ip : ctx.ip,
            userAgent : ctx.userAgent,
        },
    });
}


// Compares two rows; returns only the fields that differ, or null if nothing changed
export function changedFields(before : object, after : object, ignore : string[] = ['updatedAt']) {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};

    for (const key of Object.keys(a)) {
        if (ignore.includes(key)) continue;
        if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
            changedBefore[key] = b[key];
            changedAfter[key] = a[key];
        }
    }

    return Object.keys(changedAfter).length > 0 ? { before : changedBefore, after : changedAfter} : null;
    
}