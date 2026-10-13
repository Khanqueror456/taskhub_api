import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../../generated/prisma/client.js';
import { cursorQuery } from '../../utils/pagination.js';

export const taskParams = z.object({ orgId : z.uuid(), taskId : z.uuid() });

const taskFields = z.object({
    title : z.string().trim().min(1).max(200),
    description : z.string().trim().max(5000).nullable().optional(),
    status : z.enum(TaskStatus).optional(),
    priority : z.enum(TaskPriority).optional(),
    assigneeid : z.uuid().nullable().optional(),
    dueDate : z.coerce.date().nullable().optional(),
});

export const createTaskSchema = taskFields.extend({ projectId : z.uuid() });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = taskFields
.partial()
.refine((v) => Object.keys(v).length > 0, { message : 'Provide at least one field to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuery = cursorQuery.extend({
    projectid : z.uuid().optional(),
    status : z.enum(TaskStatus).optional(),
    priority : z.enum(TaskPriority).optional(),
    assignee : z.union([z.uuid(), z.enum(['me', 'unassigned'])]).optional(),
    dueBefore : z.coerce.date().optional(),
    dueAfter : z.coerce.date().optional(),
    // NOT z.coerce.boolean() : it turns the string 'false' into true

    overdue : z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),

    search : z.string().trim().min(1).max(100).optional(),
    sortBy : z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority']).default('createdAt'),
    order : z.enum(['asc', 'desc']).default('desc'),
});
export type ListTasksQuery = z.infer<typeof listTasksQuery>;

