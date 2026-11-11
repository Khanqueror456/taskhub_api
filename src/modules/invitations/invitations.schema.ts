import { z } from "zod";
import { email } from "../auth/auth.schema.js";
import { assginableRole } from "../organizations/organizations.schema.js";

export const invitationParams = z.object({ orgId : z.uuid(), invitationId : z.uuid()});
export const createInvitationSchema = z.object({ email, role : assginableRole.default('MEMBER') });
export const acceptInvitationSchema = z.object({ token : z.string().min(20).max(200) });