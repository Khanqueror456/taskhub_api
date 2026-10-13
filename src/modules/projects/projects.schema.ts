import { z } from "zod";
import { offsetQuery } from "../../utils/pagination.js";

export const projectParams = z.object({ orgId: z.uuid(), projectId: z.uuid() });

export const createProjectSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = createProjectSchema
.partial()
.refine((v) => Object.keys(v).length > 0, { message : 'Provide at least one field to update' });

export const listProjectsQuery = offsetQuery.extend({
    search: z.string().trim().min(1).max(100).optional()
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuery>;