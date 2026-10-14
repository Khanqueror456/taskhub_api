import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as comments from '../comments/comments.controller.js';
import {
    commentParams,
    createCommentSchema,
    listCommentsQuery,
} from '../comments/comments.schema.js';
import { orgParams } from "../organizations/organizations.schema.js";
import * as c from './tasks.controller.js';
import { createTaskSchema, listTasksQuery, taskParams, updateTaskSchema } from "./tasks.schema.js";

export const taskRouter = Router({ mergeParams : true});

taskRouter.use(authenticate);

taskRouter.get(
    '/',
    validate({ params : orgParams, query: listTasksQuery}),
    authorize('task:read'),
    c.listTask
);

taskRouter.post(
    '/',
    validate({ params : orgParams, body : createTaskSchema}),
    authorize('task:write'),
    c.createTask
)

taskRouter.get('/:taskId', validate({ params : taskParams }), authorize('task:read'), c.getTask);

taskRouter.patch(
    '/:taskId',
    validate({ params : taskParams, body : updateTaskSchema }),
    authorize('task:write'),
    c.updateTask
);

taskRouter.delete('/:taskId', validate({ params : taskParams }), authorize('task:write'), c.deleteTask);



// comments

taskRouter.get(
    '/:taskId/comments',
    validate({ params : taskParams, query : listCommentsQuery }),
    authorize('task:read'),
    comments.listComments,
);

taskRouter.post(
    '/:taskId/comments',
    validate({ params : taskParams, body : createCommentSchema }),
    authorize('task:write'),
    comments.createComment
);

taskRouter.delete(
    '/:taskId/comments/:commentId',
    validate({ params : commentParams }),
    authorize('task:write'),
    comments.deleteComment,
);