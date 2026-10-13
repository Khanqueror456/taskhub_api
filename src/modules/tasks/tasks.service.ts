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