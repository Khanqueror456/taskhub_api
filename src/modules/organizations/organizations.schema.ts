import { z } from 'zod';
import { email } from '../auth/auth.schema.js';

export const orgParams = z.object({ orgId : z.uuid() });
export const memberParams = z.object({ orgId : z.uuid(), userId : z.uuid()});

// OWNWER is deliberately missiong: ownership can't be handed out through these endpoints

const assginableRole = z.enum(['ADMIN', 'MEMBER', 'VIEWER']);

export const createOrgSchema = z.object({ name : z.string().trim().min(2).max(100)});
export const updateOrgSchema = createOrgSchema;
export const addMemberSchema = z.object({ email, role: assginableRole.default('MEMBER')});
export const updateMemberSchema = z.object({ role : assginableRole});
