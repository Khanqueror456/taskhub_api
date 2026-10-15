import { TaskStatus, type Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../utils/AppError.js'
import { cursorPage } from '../../utils/pagination.js'
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from './tasks.schema.js'

// audit log imports

import { changedFields, recordAudit, type AuditContext } from '../audit/audit.recorder.js';


async function searchTaskIds(orgId: string, term: string): Promise<string[]> {
  // Parameters are bound by Prisma's tagged template, so this is not injectable
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM tasks
    WHERE "organizationId" = ${orgId}
      AND to_tsvector('english', title || ' ' || coalesce(description, ''))
          @@ websearch_to_tsquery('english', ${term})
    LIMIT 1000`;
  return rows.map((r) => r.id);
}

// A task's project and assignee must belong to the SAME organization

async function assertProjectInOrg(orgId : string, projectId : string, db : Prisma.TransactionClient = prisma) {
    const project = await db.project.findFirst({
        where : { id : projectId, organizationId : orgId },
        select : { id : true},
    });

    if (!project) throw AppError.notFound('Project not found');
}

async function assertAssigneeInOrg(orgId : string, userId : string, db : Prisma.TransactionClient = prisma) {
    const membership = await db.membership.findUnique({
        where : { userId_organizationId : { userId, organizationId : orgId } },
        select : { id : true},
    });

    if (!membership) throw AppError.badRequest('Assignee must be a member of this organization');
}

export async function createTask(ctx : AuditContext, orgId: string, userId: string, input: CreateTaskInput) {
//   await assertProjectInOrg(orgId, input.projectId);
//   if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId);
//   return prisma.task.create({ data : { ...input, organizationId: orgId, createdById: userId } });

    return prisma.$transaction(async (tx) => {
        await assertProjectInOrg(orgId, input.projectId, tx);
        if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId, tx);

        const task = await tx.task.create({
            data : {...input, organizationId: orgId, createdById : ctx.userId}
        });

        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'task.created',
            entityType : 'task',
            entityId : task.id,
            after : task,
        });

        return task;
    })
}

export async function getTask(orgId : string, taskId : string) {
    const task = await prisma.task.findFirst({ where : { id : taskId, organizationId : orgId}});
    if (!task) throw AppError.notFound('Task not found');

    return task;
}

export async function updateTask(ctx :AuditContext ,orgId : string, taskId : string, input : UpdateTaskInput) {
    // if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId);

    // return prisma.task.update({ where : { id : taskId, organizationId : orgId }, data : input})

    return prisma.$transaction(async (tx) => {

        if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId, tx);
        
        const before = await tx.task.findFirst({
            where : { id : taskId, organizationId : orgId},
        });

        if (!before) throw AppError.notFound('Task not found');

        const after = await tx.task.update({
            where : { id : taskId},
            data : input,
        });


        const diff = changedFields(before, after);

        if (diff) {
            await recordAudit(tx, ctx, {
                organizationId : orgId,
                action : 'task.updated',
                entityType : 'task',
                entityId : taskId,
                ...diff
            })
        }

        return after;

    });
}

export async function deleteTask(ctx : AuditContext, orgId : string, taskId : string) {
    // await prisma.task.delete({ where : { id : taskId, organizationId : orgId }});

    await prisma.$transaction(async (tx) => {
        const before = await tx.task.findFirst({ where : { id : taskId, organizationId : orgId }});
        if (!before) throw AppError.notFound('Task not found');

        await tx.task.delete({ where : { id : taskId, organizationId : orgId }});
        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'task.deleted',
            entityType : 'task',
            entityId : taskId,
            before, // a snapshot, so you can still see what was deleted
        });
    });
}

export async function listTasks(orgId : string, userId : string, q : ListTasksQuery) {
    const and : Prisma.TaskWhereInput[] = [];

    if (q.dueAfter) and.push({ dueDate : { gte : q.dueAfter }});
    if (q.dueBefore) and.push({ dueDate : { lte : q.dueBefore}});
    if (q.overdue) and.push({ dueDate : { lt : new Date() }, status : { not : TaskStatus.DONE}});
    if (q.search) and.push({ id: { in: await searchTaskIds(orgId, q.search) } });


    const where : Prisma.TaskWhereInput = {
        organizationId : orgId, // the tenant boundary : always first, never optional
        ...(q.projectid ? { projectId : q.projectid } : {}),
        ...(q.status ? { status : q.status } : {}),
        ...(q.priority ? { priority : q.priority } : {}),
        ...(q.assignee === 'me' ? { assigneeId : userId } : {}),
        ...(q.assignee === 'unassigned' ? { assigneeId : null} : {}),
        ...(q.assignee && q.assignee !== 'me' && q.assignee !== 'unassigned' ? { assigneeId : q.assignee} : {}),
        AND : and,
    }

    // sortBy is validated by a Zod enum, so this cast is safe.
    // The `id` tie-breaker makes the order deterministic, which cursor require.

    const primary = { [q.sortBy] : q.order } as Prisma.TaskOrderByWithRelationInput;

    const rows = await prisma.task.findMany({
        where,
        orderBy : [primary, { id : q.order }],
        take : q.limit +  1, // one extra row tells us whether another page exists
        ...(q.cursor ? { cursor : { id : q.cursor }, skip : 1} : {}),
    });

    return cursorPage(rows, q.limit);
};