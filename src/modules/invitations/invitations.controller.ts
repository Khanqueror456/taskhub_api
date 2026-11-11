import type { Request, Response } from 'express';
import { auditContext } from "../audit/audit.recorder.js";
import * as service from './invitations.service.js';

const orgId = (req : Request) => req.membership!.organizationId;

export async function createInvitation(req : Request, res : Response) {
    res.status(201).json(await service.createInvitation(auditContext(req), orgId(req), req.body))
}

export async function listInvitations(req : Request, res : Response) {
    res.json(await service.listInvitations(orgId(req)));
}

export async function revokeInvitation(req : Request, res : Response) {
    await service.revokeInvitation(auditContext(req), orgId(req), req.params.invitationId as string);
    res.status(204).send();
}

export async function acceptInvitation(req : Request, res : Response) {
    res.json(await service.acceptInvitation(auditContext(req), req.body.token));
}