import { z } from 'zod';
import { AUDIT_ENTITY_TYPES } from '../modules/audit/audit.recorder.js';


const id = z.uuid();
const timestamp = z.iso.datetime();
const text = z.string();
const role = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

const user = z.object({ id, email : z.email(), name : text, createdAt : timestamp });
const tokens = z.object({ accessToken : text, refreshToken : text, expiresIn : z.number().int() });
const organization = z.object({ id, name : text, slug : text, createdAt : timestamp });
const organizationWithRole = organization.extend({ role });
const member = z.object({
    userId : id,
    email : z.email(),
    name : text,
    role,
    joinedAt : timestamp
});
const project = z.object({
    id,
    organizationId : id,
    name : text,
    description : text.nullable(),
    createdAt : timestamp,
    updatedAt : timestamp,
});
const task = z.object({
    id,
    organizationId : id,
    projectId : id,
    title : text,
    description : text.nullable(),
    status : z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
    priority : z.enum(['LOW', 'MEDIUM', 'HIGH']),
    assigneeId : id.nullable(),
    createdById : id.nullable(),
    dueDate : timestamp.nullable(),
    createdAt : timestamp,
    updatedAt : timestamp,
});
const comment = z.object({
    id,
    organizationId : id,
    taskId : id,
    authorId : id.nullable(),
    body : text,
    createdAt : timestamp,
    updatedAt : timestamp,
});
const invitation = z.object({
    id,
    email : z.email(),
    role,
    status : z.enum(['PENDING', 'ACCEPTED', 'REVOKED']),
    expiresAt : timestamp,
    createdAt : timestamp,
});
const auditLog = z.object({
    id,
    organizationId : id,
    actorId : id.nullable(),
    action : text,
    entityType : z.enum(AUDIT_ENTITY_TYPES),
    entityId : text,
    before : z.unknown(),
    after : z.unknown(),
    requestId : text.nullable(),
    ip : text.nullable(),
    userAgent : text.nullable(),
    createdAt : timestamp,
});

const cursorPagination = z.object({
    limit : z.number().int(),
    hasMore : z.boolean(),
    nextCursor : text.nullable(),
});

const offsetPagination = z.object({
    page : z.number().int(),
    limit : z.number().int(),
    total : z.number().int(),
    totalPages : z.number().int(),
});

// Every name here becomes components.schema.<Name> in the OpenAPI document
export const models = {
    Error : z.object({
        error : z.object({
            code : text,
            message : text,
            details : z.unknown().optional(),
            requestId : text,
        }),
    }),

    Health : z.object({
        status : z.enum(['ok', 'degraded', 'down']),
        db : z.enum(['up', 'down']),
        redis : z.enum(['up', 'down']),
        uptime : z.number(),
    }),

    Me : z.object({ user }),
    Session : tokens.extend({ user }),
    Tokens : tokens,
    Organization : organization,
    OrganizationWithRole : organizationWithRole,
    OrganizationList : z.object({ data : z.array(organizationWithRole) }),
    Member : member,
    MemberList : z.object({ data : z.array(member) }),
    Invitation : invitation,
    InvitationCreated : invitation.extend(invitation.extend({ emailQueued : z.boolean() })),
    AcceptedInvitation : z.object({ organizationId : id, role }),
    Project : project,
    ProjectPage : z.object({ data : z.array(project), pagination : offsetPagination }),
    Taks : task,
    TaskPage : z.object({ data : z.array(task), pagination : cursorPagination }),
    Comment : comment,
    CommentPage : z.object({ data : z.array(comment), pagination : cursorPagination }),
    AuditLog : auditLog,
    AuditLogPage : z.object({ data : z.array(auditLog), pagination : cursorPagination }),
}

export type ModelName = keyof typeof models;