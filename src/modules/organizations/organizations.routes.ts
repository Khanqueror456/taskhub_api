import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from './organizations.controller.js'

import {
    addMemberSchema,
    createOrgSchema,
    memberParams,
    orgParams,
    updateMemberSchema,
    updateOrgSchema
} from './organizations.schema.js'
import { apiLimiter } from "../../middleware/limiters.js";

export const orgRouter = Router();

orgRouter.use(authenticate, apiLimiter); // every org route requries login

orgRouter.post('/', validate({ body : createOrgSchema }), c.createOrg);
orgRouter.get('/', c.listMyOrgs);

// Pattern for every org-scoped route: validate input -> authorize -> controller

orgRouter.get('/:orgId', validate({ params : orgParams}), authorize('org:read'), c.getOrg);
orgRouter.patch('/:orgId', validate({ params : orgParams, body : updateOrgSchema }), authorize('org:update'), c.updateOrg)
orgRouter.delete('/:orgId', validate({ params : orgParams }), authorize('org:delete'), c.deleteOrg);

orgRouter.get(
    '/:orgId/members',
    validate({ params : orgParams}),
    authorize('member:read'),
    c.lsitMembers
);

orgRouter.post(
    '/:orgId/members', 
    validate({ params : orgParams, body : addMemberSchema}),
    authorize('member:manage'),
    c.addMember
)

orgRouter.patch(
    '/:orgId/members/:userId',
    validate({ params : memberParams, body : updateMemberSchema }),
    authorize('member:manage'),
    c.updateMember
);

orgRouter.delete(
    '/:orgId/members/:userId',
    validate({params : memberParams}),
    authorize('member:manage'),
    c.removeMember
);