import type { Request, Response } from 'express';
import type { ListAuditQuery } from './audit.schema.js';
import * as service from './audit.service.js';

export async function listAuditLogs(req : Request, res : Response) {
    res.json(await service.listAuditLogs(req.membership!.organizationId, req.query as unknown as ListAuditQuery));
}