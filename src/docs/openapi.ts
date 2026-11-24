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
    | 'Health' | 'Auth' | 'Organizations' | 'Members' | 'Invitations' | 'Projects'
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

const TAGS = [
    { name : 'Health', description : 'Liveness and dependency status' },
    { name : 'Auth', description : 'Accounts and sessions' },
    { name : 'Organizations', description : 'Tenants' },
    { name : 'Members', descriptions : 'Who belongs to an organization, and with which role' },
    { name : 'Invitations', description : 'Inviting people by email' },
    { name : 'Tasks', description : 'The work itself' },
    { name : 'Comments', description : 'Discussion on a task' },
    { name : 'Audit', description : 'Append=only history of every change' },
];

const DESCRIPTION = `
    Multi-tenant task management API. Each organization's data is isolated from every other's

    ## Authentication
    Register or log in to receive an **access token** (valid 15 minutes) and a single-use **refresh token** (7 days). Send the access token as \`Authorization: Bearer <token>\`. Exchange the refresh token at \`POST /auth/refresh\` for a new pair.


    ## Organizations and roles
    Routes under \`/orgs/{orgId}\` required membership. Callers who are not members get **404**, never 403, so organization ids cannot be probed. Roles are VIEWER < MEMBER < ADMIN < OWNER, and each operation states the permission it needs and which roles hold it.
    
    ## Pagination
    Projects use \`page\` and \`limit\`. Tasks, comments and audit logs use cursors: pass the previous reponse's \`pagination.nextCursor\` as \`cursor\`.

    ## Errors and rate limits
    Every error has the shape \`{ "error" : { "code" , "message", "details?", "requestId" }}\`, and the same id is returned in the \`x-request-id\` header. Limits are reported in \`RateLimit-*\` headers, and exceeding one return **429** with \'Retry-After\`.
`.trim();

const ERROR_RESPONSES : Record<number, { name : string, description : string }> = {

    400 : { name : 'BadRequest', description : 'The request failed validation. `error.details` lists each invalid field and where it was.' },
    401 : { name : 'Unauthorized', description : 'Missing, invalid or expired credentials.' },
    403 : { name : 'Forbidden', description : "The caller's role does not hold the required permission." },
    404 : { name : 'NotFound', description : 'The resources does not exist, or the caller is not member of the organization (the two are deliberately indistinguishable).' },
    409 : { name : 'Conflict', description : 'The request conflicts with existing data.' },
    410 : { name : 'Gone', description : 'The invitation was revoked, has expired, or was already used.'},
    429 : { name : 'TooManyRequests', description : 'Rate limit exceeded. See the Retry-After header.' },
    503 : { name : 'ServiceUnavailable', description : 'The database is unreachable.' }
};

const OPERATIONS : Operation[] = [
    // -------------Health---------------
    {
        id : 'getHealth', method : 'get', path : '/health', tag : 'Health', summary : 'Service health',
        description : 'Reports database and Redis status. Only a database outage return 503; a Redis outage is "degraded", because the API keeps working without it.',
        public : true, outsideApiPrefix : true,
        success : { status : 200, model : 'Health', description : 'The service is up (possibly degraded)' },
        errors : [503],
    },

    // --------------Auth-------------
    {
        id : 'registerUser', method : 'post', path : '/auth/register', tag : 'Auth', summary : 'Create an account',
        description : 'Returns the new user and a token pair. Limited to 20 requests per 15 minutes per IP.',
        public : true, body : registerSchema,
        success : { status : 201, model : 'Session', description : 'Account created' },
        errors : [409, 429],
    },
    {
        id : 'loginUser', method : 'post', path : '/auth/login', tag : 'Auth', summary : 'Sign in',
        description : 'Limited to 20 requests per 15 minutes per IP and 10 per 15 minutes per email. An unkown email and a wrong password produce the same 401.',
        public : true, body : loginSchema,
        success : { status : 200, model : 'Session', description : 'Signed in' },
    },
    {
        id : 'refreshSession', method : 'post', path : '/auth/refresh', tag : 'Auth', summary : 'Rotate the token pair',
        description : 'A refresh token works once. Presenting an already-used one revokes the whole session.',
        public : true, body : refreshSchema,
        success : { status : 200, model : 'Tokens', description : 'New token pair' },
        errors : [401, 429],
    },
    {
        id : 'logoutUser', method : 'post', path : '/auth/logout', tag : 'Auth', summary : 'Revoke a refresh token',
        description : 'Always succeeds, even for unknown or already revoked tokens.',
        public : true, body : refreshSchema,
        success : { status : 204, description : 'Logged out' },
        errors : [429],
    },
    {
        id : 'getCurrentuser', method : 'get', path : '/auth/me', tag : 'Auth', summary : 'The signed-in user',
        success : { status : 200, model : 'Me', description : 'The current user' },
    },

    // ---------------Organizations--------------

    {
        id : 'createOrganization', method : 'post', path : '/orgs', tag : 'Organizations', summary : 'Create an organization',
        description : 'The caller becomes its OWNER.', body :  createOrgSchema,
        success : { status : 201, model : 'OrganizationWithRole', description : 'Organization created' },
    },
    {
        id : 'listMyOrganizations', method : 'get', path : '/orgs', tag : 'Organizations', summary : 'List my organizations',
        success : { status : 200, model : 'OrganizationList', description : 'Organizations the caller belongs to, with their role' },
    },
    {
        id : 'getOrganization', method : 'get', path : '/orgs/{orgId}', tag : 'Organizations', summary : 'Get an organization',
        params : orgParams, permission : 'org:read',
        success : { status : 200, model : 'OrganizationWithRole', description : 'The organization and the caller\'s role' },
    },
    {
        id : 'updateOrganization', method : 'patch', path : '/orgs/{orgId}', tag : 'Organizations', summary : 'Rename an organization',
        params : orgParams, body : updateOrgSchema, permission : 'org:update',
        success : { status : 200, model : 'Organization', description : 'The updated organization' },
    },
    {
        id : 'deletedOrganization', method : 'delete', path : '/orgs/{orgId}', tag : 'Organizations', summary : 'Delete an organization',
        description : 'Deletes everything inside it. Its audit hsitory is kept.',
        params : orgParams, permission : 'org:delete',
        success : { status : 204, description : 'Deleted' },
    },
    

    // ---------------Members--------------

    {
        id : 'listMembers', method : 'get', path : '/orgs/{orgId}/members', tag : 'Members', summary : 'List members',
        params : orgParams, permission : 'member:read',
        success : { status : 200, model : 'MemberList', description : 'Members of the organization' },
    },
    {
        id : 'addMember', method : 'post', path : '/orgs/{orgId}/members', tag : 'Members', summary : 'Add an existing user',
        description : 'Adds a registered user by email. To bring in someone without an account, use an invitation.',
        params : orgParams, body : addMemberSchema, permission : 'member:manage',
        success : { status : 201, model : 'Member', description : 'Member added' },
        errors : [409],
    },
    {
        id : 'updateMemberRole', method : 'patch', path : '/orgs/{orgId}/members/{userId}', tag : 'Members', summary : 'Change a member\'s role',
        description : "The OWNER's role cannot be changed (403).",
        params : memberParams, body : updateMemberSchema, permission : 'member:manage',
        success : { status : 200, model : 'Member', description : 'The updated member' },
    },
    {
        id :'removeMember', method : 'delete', path : '/orgs/{orgId}/members/{userId}', tag : 'Members', summary : "Remove a member",
        description : "Also unassigns the member's tasks in this organization. The OWNER cannot be removed (403)",
        params : memberParams, permission : 'member:manage',
        success : { status : 204, description : 'Removed' },
    },


    // -----------Projects-------------

    {
        id : 'listProjects', method : 'get', path : '/orgs/{orgId}/projects', tag : 'Projects', summary : 'List projects',
        description : 'Offset pagination, newest first.',
        params : orgParams, query : listProjectsQuery, permission : 'project:read',
        success : { status : 200, model : 'ProjectPage', description : 'A page of projects' },
    },
    {
        id : 'createProject', method : 'post', path : '/orgs/{orgId}/projects', tag : 'Projects', summary : 'Create a project',
        params : orgParams, body : createProjectSchema, permission : 'project:write',
        success : { status : 201, model : 'Project', description : 'Project created' },
    },
    {
        id : 'getProject', method : 'get', path : '/orgs/{orgId}/projects/{projectId}', tag : 'Projects', summary : "Get a project",
        params : projectParams, permission : 'project:read',
        success : { status : 200, model : 'Project', description : 'The project' },
    },
    {
        id : 'updateProject', method : 'patch', path : '/orgs/{orgId}/projects/{projectId}', tag : 'Projects', summary : 'Update a project',
        params : projectParams, body : updateProjectSchema, permission : 'project:write',
        success : { status : 200, model : 'Project', description : 'The updated project' },
    },
    {
        id : 'deleteProject', method : 'delete', path : '/orgs/{orgId}/projects/{projectId}', tag : 'Projects', summary : 'Delete a project',
        description : 'Deletes the project and all of its tasks.',
        params : projectParams, permission : 'project:write',
        success : { status : 204, description : 'Deleted' },
    },

    // ---------------------Tasks------------------
    {
        id : 'listTaks', method : 'get', path : '/orgs/{orgId}/tasks', tag : 'Tasks', summary : 'List and search tasks',
        description : 'Cursor pagination with filtering, sorting and full-text search. `assignee` accepts a user id, `me`, or `unassigned`. `overdue=true` means past due and not DONE',
        params : orgParams, query : listTasksQuery, permission : 'task:read',
        success : { status : 200, model : 'TaskPage', description : 'A page of tasks' },
    },
    {
        id : 'createTask', method : 'post', path : '/orgs/{orgId}/tasks', tag : 'Tasks', summary : 'Create a task',
        description : 'The project and the assignee must belong to this organization.',
        params : orgParams, body : createTaskSchema, permission : 'task:write',
        success : { status : 201, model : 'Task', description : 'Task created' },
    },
    {
        id : 'getTask', method : 'get', path : '/orgs/{orgId}/tasks/{taskId}', tag : 'Tasks', summary : 'Get a task',
        params : taskParams, permission : 'task:read',
        success : { status : 200, model : 'Task', description : 'The task' },
    },
    {
        id : 'updateTask', method : 'patch', path : '/orgs/{orgId}/tasks/{taskId}', tag : 'Tasks', summary : 'Update a task',
        description : 'Send only the fields to change. Send `null` to clear the assignee, description, or due date.',
        params : taskParams, body : updateTaskSchema, permission : 'task:write',
        success : { status : 200, model : 'Task', description : 'The upated task' },
    },
    {
        id : 'deleteTask', method : 'delete', path : '/orgs/{orgId}/tasks/{taskId}', tag : 'Tasks', summary : 'Delete a task',
        params : taskParams, permission : 'task:write',
        success : { status : 204, description : 'Deleted' },
    },


    //------------Comments-------------
    {
        id : 'listComments', method : 'get', path : '/orgs/{orgId}/tasks/{taskId}/comments', tag : 'Comments', summary : 'List comments',
        description : 'Oldest first, cursor pagination.',
        params : taskParams, query : listCommentsQuery, permission : 'task:read',
        success : { status : 200, model : 'CommentPage', description : 'A page of comments' },
    },
    {
        id : 'createComment', method : 'post', path : '/orgs/{orgId}/tasks/{taskId}/comments', tag : 'Comments', summary : 'Add a comment',
        params : taskParams, body : createCommentSchema, permission : 'task:write',
        success : { status : 201, model : 'Comment', description : 'Comment added' },
    },
    {
        id : 'deleteComment', method : 'delete', path : '/orgs/{orgId}/tasks/{taskId}/comments/{commentId}', tag : 'Comments', summary : 'Delete a comment',
        description : 'Authors can delete their own comments. ADMIN and OWNER can delete any.',
        params : commentParams, permission : 'task:write',
        success : { status : 204, description : 'Deleted' },
    },


    // -----------------Audit------------------
    {
        id : 'listAuditLogs', method : 'get', path : '/orgs/{orgId}/audit-logs', tag : 'Audit', summary : 'Read the audit log',
        description : 'Newest first, cursor pagination. Filter by entity, actor or action to see the history of one thing.',
        params : orgParams, query : listAuditQuery, permission : 'audit:read',
        success : { status : 200, model : 'AuditLogPage', description : 'A page of audit entries' },
    },
];


// ---------------------------------------------------------------------------
// Everything below turns the table above into an OpenAPI 3.1 document.
// ---------------------------------------------------------------------------

function toSchema(schema : z.ZodType, io : 'input' | 'output') :  Json {
    const json = z.toJSONSchema(schema, {
        target : 'draft-2020-12',
        io,
        unrepresentable : 'any',
        override : (ctx) => {
            // JSON has no Date type: dates travel as ISO strings
            if (ctx.zodSchema._zod.def.type === 'date') {
                ctx.jsonSchema.type = 'string';
                ctx.jsonSchema.format = 'date-time';
            }
        },
    }) as Json;
    delete json.$schema;
    return json;
}

function toParameters(schema : z.ZodType, where : 'path' | 'query') {
    const json = toSchema(schema, 'input') as { properties? : Record<string, Json>; required? : string[] };
    const required = new Set(json.required ?? []);
    return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => ({
        name,
        in : where,
        required : where === 'path' || required.has(name),
        schema : propertySchema
    }));
}