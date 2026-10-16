import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { orgParams } from "../organizations/organizations.schema.js";
import { listAuditLogs } from "./audit.controller.js";
import { listAuditQuery } from "./audit.schema.js";


export const auditRouter = Router({ mergeParams : true });

auditRouter.use(authenticate);

auditRouter.get(
    '/',
    validate({ params : orgParams, query : listAuditQuery }),
    authorize('audit:read'),
    listAuditLogs,
);