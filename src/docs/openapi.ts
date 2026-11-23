import { z } from 'zod';
import { env } from '../config/env.js';
import { rolePermissions, type Permission } from '../modules/rbac/permissions.js';
import { loginSchema, refreshSchema, registerSchema } from '../modules/auth/auth.schema.js';
import { listAuditQuery } from '../modules/audit/audit.schema.js';
import { commentParams, createCommentSchema, listCommentsQuery } from '../modules/comments/comments.schema.js';
import { acceptInvitationSchema, createInvitationSchema, invitationParams } from '../modules/invitations/invitations.schema.js';
import { addMemberSchema, createOrgSchema, memberParams, orgParams, updateMemberSchema, updateOrgSchema } from '../modules/organizations/organizations.schema.js';
import { createProjectSchema, listProjectsQuery, projectParams, updateProjectSchema } from '../modules/projects/projects.schema.js';
import { createTaskSchema, listTasksQuery, taskParams, updateTaskSchema } from '../modules/tasks/tasks.schema.js';
import { models, type ModelName } from './models.js';

export const API_VERSION = '1.0.0';

type Json = Record<string, unknown>;
type Tag = 
    | 'Health' | 'Auth' | 'Organization' | 'Members' | 'Invitations' | 'Projects'
    | 'Tasks' | 'Comments' | 'Audit';

interface Operation {
    id : string;
    method : 'get' | 'post' | 'patch' | 'delete';
    path : string; // relative to /api/v1, OpenAPI style: /orgs/{orgId}
    tag : Tag;
    summary : string;
    description? : string;
    public? : boolean; // no bearer token needed
    outsideApiPrefix? : boolean; // served at the root, not under /api/v1
    permission? : Permission,
    params? : z.ZodType;
    query? : z.ZodType;
    body? : z.ZodType;
    success : { status : 200 | 201 | 204; model? : ModelName; description : string };
    errors? : number[]; // in addition to the ones derived automatically

}