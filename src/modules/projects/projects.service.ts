import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { offsetMeta } from "../../utils/pagination.js";
import type { ListProjectsQuery } from "./projects.schema.js";
import { changedFields, recordAudit, type AuditContext } from '../audit/audit.recorder.js';
import { deleteTask } from "../tasks/tasks.service.js";


export function createProject(ctx : AuditContext, orgId : string, input : { name : string; description? : string}) {

    // return prisma.project.create({ data : { ...input, organizationId : orgId }});
    
    return prisma.$transaction(async(tx) => {

        const project = await tx.project.create({
            data : { ...input, organizationId : orgId}
        })

        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'project.created',
            entityType : 'project',
            entityId : project.id,
            after: project,
        });

        return project;
    })

}

export async function listProjects(orgId : string, q : ListProjectsQuery)
{
    const where : Prisma.ProjectWhereInput = {
        organizationId : orgId,
        ...(q.search ? { name : { contains : q.search, mode : 'insensitive'}}: {}),
    };

    // count + page in one transaction so they describe the same snapshot

    const [total, data] = await prisma.$transaction([
        prisma.project.count({ where }),
        prisma.project.findMany({
            where,
            orderBy : { createdAt : 'desc'},
            skip : (q.page - 1) * q.limit,
            take: q.limit
        }),
    ]);

    return { data, pagination : offsetMeta(q.page, q.limit, total) };
}

export async function getProject(orgId : string, projectId : string) {
    const project = await prisma.project.findFirst({ where : { id : projectId, organizationId : orgId }})
    if (!project) throw AppError.notFound('Project not found');
    return project;
}

export function updateProject(
    ctx : AuditContext,
    orgId : string,
    projectId : string,
    input : { name?: string, description?: string },
) {
    // return prisma.project.update({ where : { id : projectId, organizationId : orgId }, data : input})

    return prisma.$transaction(async (tx) => {

        const before = await tx.project.findFirst({
            where : {id : projectId, organizationId : orgId}
        });

        if (!before) throw AppError.notFound('Project not found');

        const after = await tx.project.update({
            where : {id : projectId, organizationId : orgId},
            data : input
        });

        const diff = changedFields(before, after);

        if (diff)
        {
            await recordAudit(tx, ctx, {
                organizationId : orgId,
                action : 'project.updated',
                entityType : 'project',
                entityId : projectId,
                ...diff
            });
        }

        return after;
    })

    
}

export async function deleteProject(ctx : AuditContext, orgId : string, projectId : string)
{
    // await prisma.project.delete({ where : { id : projectId, organizationId : orgId }});

    prisma.$transaction(async (tx) => {

        const before = await tx.project.findFirst({
            where : {id : projectId, organizationId : orgId}
        });

        if (!before) throw AppError.notFound('Project not found');


        // Deleting a project cascades to its tasks; record how many went with it
        const deletedTasks = await tx.task.count({ where: { projectId, organizationId: orgId } });
        await tx.project.delete({
            where : { id : projectId, organizationId : orgId }
        });

        await recordAudit(tx, ctx, {
            organizationId : orgId,
            action : 'project.deleted',
            entityType : 'project',
            entityId : projectId,
            before,
            after : { deletedTasks },
        });
    });
}