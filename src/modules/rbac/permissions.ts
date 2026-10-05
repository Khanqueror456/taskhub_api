import type { Role } from "../../generated/prisma/client.js";

export type Permissions = 
    | 'org:read'
    | 'org:update'
    | 'org:delete'
    | 'member:read'
    | 'member:manage'
    | 'project:read'
    | 'project:write'
    | 'task:read'
    | 'task:write'


const READ: Permissions[] = ['org:read', 'member:read', 'project:read', 'task:read'];

export const rolePermissions : Record<Role, readonly Permissions[]> = {
    VIEWER : READ,
    MEMBER : [...READ, 'task:write'],
    ADMIN : [...READ, 'task:write', 'project:write', 'org:update', 'member:manage'],
    OWNER : [...READ, 'task:write', 'project:write', 'org:update', 'member:manage', 'org:delete'],
};

export function hasPermission(role : Role, permission : Permissions) : boolean {
    return rolePermissions[role].includes(permission);
}
