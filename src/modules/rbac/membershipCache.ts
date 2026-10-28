import type { Role } from "../../generated/prisma/client.js";
import { cacheDel } from "../../lib/cache.js";

export interface CachedMembership {

    organizationId : string,
    role : Role
};

export const MEMBERSHIP_TTL_SECONDS = 60;

export const membershipKey = (orgId : string, userId : string) => `membership:${orgId}:${userId}`;

export function invalidateMemberships(orgId : string, userIds : string[]) {
    return cacheDel(...userIds.map((id) => membershipKey(orgId, id)));
}