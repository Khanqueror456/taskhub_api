import type { Prisma, Role } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { cursorPage } from '../../utils/pagination.js';
import { hasPermission } from '../rbac/permissions.js';
import type { ListCommentsQuery } from './comments.schema.js';
import { changedFields, recordAudit, type AuditContext } from '../audit/audit.recorder.js';


async function assertTaskInOrg(orgId : string, taskId : string, db : Prisma.TransactionClient = prisma) {
    const task = await db.task.findFirst({
        where : { id : taskId, organizationId : orgId },
        select : { id : true }
    })

    if (!task) throw AppError.notFound('Task not found');
};

export async function listComments(orgId : string, taskId : string, q : ListCommentsQuery) {
    await assertTaskInOrg(orgId, taskId);
    const rows = await prisma.comment.findMany({
        where : { organizationId : orgId, taskId },
        orderBy : [{ createdAt : 'desc'}, { id : 'asc'}],
        take : q.limit + 1,
        ...(q.cursor ? { cursor : { id : q.cursor }, skip : 1} : {}),
    });

    return cursorPage(rows, q.limit);
}

export async function createComment(ctx : AuditContext, orgId : string, taskId : string, authorId : string, body : string) {
    // await assertTaskInOrg(orgId, taskId);
    // return prisma.comment.create({ data : { organizationId : orgId, taskId, authorId, body }});

    return prisma.$transaction(async (tx) => {

        await assertTaskInOrg(orgId, taskId, tx);

        const comment = await tx.comment.create({ data : { organizationId : orgId, taskId, authorId, body}});

        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'comment.created',
            entityType : "comment",
            entityId : comment.id,
            after : comment,
        })

        return comment;
    })
};

export async function deleteComment(
    ctx : AuditContext,
    orgId : string,
    taskId : string,
    commentId : string,
    userId : string,
    role : Role
) {
    // const comment = await prisma.comment.findFirst({
    //     where : { id : commentId, taskId, organizationId : orgId },
    // });

    // if (!comment) throw AppError.notFound('Comment not found');

    // // Authors can delete their own comments; admins and owners can delete any
    // if (comment.authorId !== userId && !hasPermission(role, 'project:write')) {
    //     throw AppError.forbidden('You can only delete your own comments');
    // }

    // await prisma.comment.delete({ where : { id : comment.id } });

    await prisma.$transaction(async (tx) => {

        const before = await tx.comment.findFirst({
            where : { id : commentId, taskId, organizationId : orgId }
        });

        if (!before) throw AppError.notFound('Comment not found');

        // Authors can delete their own comments; admins and owners can delete any
        if (before.authorId !== userId && !hasPermission(role, 'project:write')) {
            throw AppError.forbidden('You can only delete your own comments');
        }

        await tx.comment.delete({
            where : {id : before.id}
        });
        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'comment.deleted',
            entityType : 'comment',
            entityId : before.id,
            before : before
        });
    });
}