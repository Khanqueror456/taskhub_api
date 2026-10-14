import { TaskStatus, type Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../utils/AppError.js'
import { cursorPage } from '../../utils/pagination.js'
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from './tasks.schema.js'


// A task's project and assignee must belong to the SAME organization

async function assertProjectInOrg(orgId : string, projectId : string) {
    const project = await prisma.project.findFirst({
        where : { id : projectId, organizationId : orgId },
        select : { id : true},
    });

    if (!project) throw AppError.notFound('Project not found');
}

async function assertAssigneeInOrg(orgId : string, userId : string) {
    const membership = await prisma.membership.findUnique({
        where : { userId_organizationId : { userId, organizationId : orgId } },
        select : { id : true},
    });

    if (!membership) throw AppError.badRequest('Assignee must be a member of this organization');
}

export async function createTask(orgId: string, userId: string, input: CreateTaskInput) {
  await assertProjectInOrg(orgId, input.projectId);
  if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId);

  return prisma.task.create({ data : { ...input, organizationId: orgId, createdById: userId } });
}

export async function getTask(orgId : string, taskId : string) {
    const task = await prisma.task.findFirst({ where : { id : taskId, organizationId : orgId}});
    if (!task) throw AppError.notFound('Task not found');

    return task;
}

export async function updateTask(orgId : string, taskId : string, input : UpdateTaskInput) {
    if (input.assigneeId) await assertAssigneeInOrg(orgId, input.assigneeId);

    return prisma.task.update({ where : { id : taskId, organizationId : orgId }, data : input})
}

export async function deleteTask(orgId : string, taskId : string) {
    await prisma.task.delete({ where : { id : taskId, organizationId : orgId }});
}

export async function listTasks(orgId : string, userId : string, q : ListTasksQuery) {
    const and : Prisma.TaskWhereInput[] = [];

    if (q.dueAfter) and.push({ dueDate : { gte : q.dueAfter }});
    if (q.dueBefore) and.push({ dueDate : { lte : q.dueBefore}});
    if (q.overdue) and.push({ dueDate : { lt : new Date() }, status : { not : TaskStatus.DONE}});
    if (q.search) {
        and.push({
            OR : [
                { title : { contains : q.search, mode : 'insensitive'}},
                {description : { contains : q.search, mode : 'insensitive'}},
            ],
        });
    }


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
        take : q.limit +  1, // one extra row tells us whether another page exitst
        ...(q.cursor ? { cursor : { id : q.cursor }, skip : 1} : {}),
    });

    return cursorPage(rows, q.limit);
};