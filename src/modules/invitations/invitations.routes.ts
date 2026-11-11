import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { acceptInviteLimiter, apiLimiter } from "../../middleware/limiters.js";
import { validate } from "../../middleware/validate.js";
import { orgParams } from "../organizations/organizations.schema.js";
import * as c from './invitations.controller.js';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationParams,
} from './invitations.schema.js';

// Org-scoped : managing invitations needs member:manage (ADMIN and OWNER)
export const invitationRouter = Router({ mergeParams : true });
invitationRouter.use(authenticate, apiLimiter);

invitationRouter.post(
    '/',
    validate({ params : orgParams, body : createInvitationSchema }),
    authorize('member:manage'),
    c.createInvitation
);

invitationRouter.get('/', validate({ params : orgParams }), authorize('member:manage'), c.listInvitations);

invitationRouter.delete(
    '/:invitationId',
    validate({ params : invitationParams }),
    authorize('member:manage'),
    c.revokeInvitation,
);

// Not org-scoped: the invitee is not a member yes, so there is nothing to authorize against
export const acceptInvitationRouter = Router();
acceptInvitationRouter.use(authenticate);
acceptInvitationRouter.post(
    '/accept',
    acceptInviteLimiter,
    validate({ body : acceptInvitationSchema }),
    c.acceptInvitation,
);