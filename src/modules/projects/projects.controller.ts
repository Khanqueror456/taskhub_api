import type { Request, Response } from "express";
import type { ListProjectsQuery } from "./projects.schema.js";
import * as service from './projects.service.js';

const orgId = (req : Request) => req.membership!.organizationId;
const projectId = (req : Request) => req.params.projectId as string;

export async function createProject(req : Request, res : Response) {
    res.status(201).json(await service.createProject(orgId(req), req.body));
}

export async function listProjects(req : Request, res : Response) {
    // `validate` already guaranteed the shape; the cast only informs TypeScript
    res.json(await service.listProjects(orgId(req), req.query as unknown as ListProjectsQuery))
}

export async function getProject(req : Request, res : Response) {
    res.json(await service.getProject(orgId(req), projectId(req)));
}

export async function updateProject(req : Request, res : Response) {
    res.json(await service.updateProject(orgId(req), projectId(req), req.body));
}

export async function deleteProject(req : Request, res : Response) {
    await service.deleteProject(orgId(req), projectId(req));
    res.status(204).send();
}