import { prisma } from "../../lib/prisma.js";
import { cursorPage } from "../../utils/pagination.js";
import type { ListAuditQuery } from "./audit.schema.js";

export async function listAuditLogs(orgId : string, q: ListAuditQuery) {
    const rows = await prisma.auditLog.findMany({
        where : {
            organizationId : orgId,
            ...(q.entityType ? { entityType : q.entityType } : {}),
            ...(q.entityId ? { entityId : q.entityId }: {}),
            ...(q.actorId ? { actorId : q.actorId } : {}),
            ...(q.action ? { action : q.action } : {}),
        },

        orderBy : [{ createdAt : 'desc'}, { id : 'desc' }],
        take : q.limit + 1,
        ...(q.cursor ? { cursor : { id : q.cursor }, skip : 1} : {}),
    });

    return cursorPage(rows, q.limit);
}