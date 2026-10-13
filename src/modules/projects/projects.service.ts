import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { offsetMeta } from "../../utils/pagination.js";
import type { ListProjectsQuery } from "./projects.schema.js";


export function createProject(orgId : string, input : { name : string; description? : string}) {

    return prisma.project.create({ data : { ...input, organizationId : orgId }});
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
    orgId : string,
    projectId : string,
    input : { name?: string, description?: string },
) {
    return prisma.project.update({ where : { id : projectId, organizationId : orgId }, data : input})
}

export async function deleteProject(orgId : string, projectId : string)
{
    await prisma.project.delete({ where : { id : projectId, organizationId : orgId }});
}