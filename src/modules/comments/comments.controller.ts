import type { Request, Response } from 'express';
import type { ListCommentsQuery } from './comments.schema.js';
import * as service from './comments.service.js';

const orgId = (req : Request) => req.membership!.organizationId;
const taskId = (req : Request) => req.params.taskId as string;

export async function listComments(req : Request, res : Response) {
    res.json(
        await service.listComments(orgId(req), taskId(req), req.query as unknown as ListCommentsQuery),
    )
};

export async function createComment(req : Request, res : Response) {
    res.status(201).json(await service.createComment(orgId(req), taskId(req), req.user!.id, req.body.body));
};

export async function deleteComment(req : Request, res : Response) {
    await service.deleteComment(
        orgId(req),
        taskId(req),
        req.params.commentId as string,
        req.user!.id,
        req.membership!.role
    );
    res.status(204).send();
}