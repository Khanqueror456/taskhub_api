import { z } from 'zod';
import { cursorQuery } from '../../utils/pagination.js';


export const commentParams = z.object({
    orgId : z.uuid(),
    taskId : z.uuid(),
    commentId : z.uuid(),
});

export const createCommentSchema = z.object({ body : z.string().trim().min(1).max(2000)});
export const listCommentsQuery = cursorQuery;
export type ListCommentsQuery = z.infer<typeof listCommentsQuery>;