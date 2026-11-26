import { z } from 'zod';

export const generateTasksRequestSchema = z.object({
    goal : z.string().trim().min(5, 'Goal must be al teast 5 characters').max(2000),
    maxTasks : z.number().int().min(1).max(10).optional().default(5),
});

export type GenerateTasksRequestInput = z.infer<typeof generateTasksRequestSchema>;

export const generatedTaskSchema = z.object({
    title : z.string().min(1),
    description : z.string().min(1),
    priority : z.enum(['LOW', 'MEDIUM', 'HIGH']),
    estimatedHours : z.number().positive(),
});

export const generatedTaskPlanSchema = z.object({
    planSummary : z.string().min(1),
    tasks : z.array(generatedTaskSchema).min(1),
});

export type GeneratedTaskPlan = z.infer<typeof generatedTaskPlanSchema>;

export const genereatedTaskPlanJsonSchema = {
    type : 'object',
    additionalProperties : false,
    required : ['planSummary', 'tasks'],
    properties : {
        planSummary : { type : 'string' },
        tasks : {
            type : 'array',
            items : {
                type : 'object',
                additionalProperties : false,
                required : ['title', 'description', 'priority', 'estimatedHours'],
                properties : {
                    title : { type : 'string' },
                    description : { type : 'string' },
                    priority : { type : 'string', enum : ['LOW', 'MEDIUM', 'HIGH'] },
                    estimatedHours : { type : 'number' },
                }
            }
        }
    }
} as const;