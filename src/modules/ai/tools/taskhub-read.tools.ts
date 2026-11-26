import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { ToolRegistry } from './tool.registry.js';

export function registerTaskHubReadTools(registry: ToolRegistry): void {

    // 1. get_projects
    registry.register({
        name: 'get_projects',
        description: 'List projects in the current organization with their task counts.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                limit: { type: 'number', description: 'Max projects to return (1-20, default 10)' },
            },
        },
        argsSchema: z.object({
            limit: z.number().int().min(1).max(20).optional().default(10),
        }),

        execute: async (args, ctx) => {
            const projects = await prisma.project.findMany({
                where: { organizationId: ctx.organizationId },
                take: args.limit,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    _count: { select: { tasks: true } }
                }
            });

            return { projects };
        }
    });

    // 2. get_tasks
    registry.register({
        name: 'get_tasks',
        description: 'Get tasks in the current organization with filters such as status and priority',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                projectId: { type: 'string', description: 'Optional project UUID' },
                status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], description: 'Filter by task status' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Filter by task priority' },
                limit: { type: 'number', description: 'Max projects to return (1-20, default 10)' }
            }
        },

        argsSchema: z.object({
            projectId: z.uuid().optional(),
            status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
            limit: z.number().int().min(1).max(20).optional().default(10),
        }),

        execute: async (args, ctx) => {

            const tasks = await prisma.task.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    ...(args.projectId && { projectId : args.projectId}),
                    ...(args.status && { status : args.status } ),
                    ...(args.priority && { priority : args.priority }),
                },
                take : args.limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    createdAt: true,
                    dueDate: true,
                }
            });

            return { tasks };
        }
    })


    // get_overdue_tasks
    registry.register({
        name: 'get_overdue_tasks',
        description: 'Get the incomplete taks whose due date is before new Date()',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                limit: { type: 'number', description: 'Max projects to return (1-20, default 10)' }
            }
        },
        argsSchema: z.object({
            limit: z.number().int().min(1).max(20).optional().default(10),
        }),

        execute: async (args, ctx) => {

            const overdue_tasks = await prisma.task.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    dueDate: { lt: new Date() },
                    status : { not : 'DONE' }
                },
                take : args.limit,
                orderBy: { dueDate: 'asc' },

                select: {
                    id: true,
                    title: true,
                    description: true,
                    status: true,
                    priority: true,
                    createdAt: true,
                    dueDate: true,
                }
            });

            return { overdue_tasks };
        }
    })
}