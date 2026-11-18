import { z } from 'zod';


const historyItemSchema = z.object({
    role : z.enum(['user', 'assistant']),
    content : z.string().trim().min(1).max(4000),
});

export const chatRequestSchema = z.object({
    message : z.string().trim().min(1, 'Message is required').max(4000),
    history : z.array(historyItemSchema).max(10).optional().default([]),
    projectSummary : z.string().trim().max(2000).optional()
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;