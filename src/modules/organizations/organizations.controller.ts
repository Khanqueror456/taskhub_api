import { Request, Response} from 'express';
import * as service from './organizations.service.js';
import { auditContext } from '../audit/audit.recorder.js';

// the org id comes from the VERIFIED membership set by 'authorize;
const orgId = (req: Request) => req.membership!.organizationId;
const targetUserId = (req: Request) => req.params.userId as string;

export async function createOrg(req: Request, res: Response) {

    res.status(201).json(await service.createOrganization(auditContext(req), req.user!.id, req.body.name));
}

export async function listMyOrgs(req: Request, res: Response) {
    res.json({ data: await service.listMyOrganizations(req.user!.id)});
}


export async function getOrg(req: Request, res: Response) {
    const org = await service.getOrganization(orgId(req));
    res.json({ ...org, role : req.membership!.role});
}


export async function updateOrg(req: Request, res: Response) {
    res.json(await service.updateOrganization(auditContext(req), orgId(req), req.body.name));
}

export async function deleteOrg(req: Request, res: Response) {
    await service.deleteOrganization(auditContext(req), orgId(req));
    res.status(204).send();
}

export async function lsitMembers(req: Request, res: Response) {
    res.json({ data : await service.listMembers(orgId(req))});
}

export async function addMember(req: Request, res: Response) {
    res.status(201).json(await service.addMember(auditContext(req), orgId(req), req.body));
}

export async function updateMember(req: Request, res: Response) {
  res.json(await service.updateMemberRole(auditContext(req), orgId(req), targetUserId(req), req.body.role));
}

export async function removeMember(req: Request, res: Response) {
    await service.removeMember(auditContext(req), orgId(req), targetUserId(req));
    res.status(204).send();
}