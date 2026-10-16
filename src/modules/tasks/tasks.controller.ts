import type { Request, Response } from "express";
import type { ListTasksQuery } from "./tasks.schema.js";
import * as service from './tasks.service.js'
import { auditContext } from "../audit/audit.recorder.js";

const orgId = (req : Request) => req.membership!.organizationId;
const taskId = (req: Request) => req.params.taskId as string;

export async function createTask(req : Request, res : Response) {
    res.status(201).json(await service.createTask(auditContext(req), orgId(req), req.user!.id, req.body));
}

export async function listTask(req : Request, res : Response) {
    res.json(await service.listTasks(orgId(req), req.user!.id, req.query as unknown as ListTasksQuery));
}

export async function getTask(req : Request, res : Response) {
    res.json(await service.getTask(orgId(req), taskId(req)));
};

export async function updateTask(req : Request, res : Response) {
    res.json(await service.updateTask(auditContext(req), orgId(req), taskId(req), req.body));
};

export async function deleteTask(req : Request, res : Response) {
    await service.deleteTask(auditContext(req), orgId(req), taskId(req));
    res.status(204).send();
}