import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { hasPermission, type Permission } from '../modules/rbac/permissions.js';
import { AppError } from '../utils/AppError.js';

/**
 * Must run after `authenticate` on a route that has an :orgId param.
 * Verifies the user belongs to that org and holds the permission,
 * then stores the verified membership on req.membership.
 */

import { cached } from '../lib/cache.js';
import {
    MEMBERSHIP_TTL_SECONDS,
    membershipKey,
    type CachedMembership
} from "../modules/rbac/membershipCache.js";

export const authorize =
    (permission: Permission): RequestHandler =>
        async (req, _res, next) => {

            const organizationId = req.params.orgId as string;

            // const membership = await prisma.membership.findUnique(
            //     {

            //         where: { userId_organizationId: { userId: req.user!.id, organizationId } },
            //         select: { organizationId: true, role: true }
            //     }
            // )


            const userId = req.user!.id;
            const membership = await cached<CachedMembership>(
                membershipKey(organizationId, userId),
                MEMBERSHIP_TTL_SECONDS,
                () => 
                    prisma.membership.findUnique({
                        where : { userId_organizationId : { userId, organizationId }},
                        select : { organizationId : true, role : true}
                    }),
            );

            // Not a member: pretend the org doesn't exist

            if (!membership) throw AppError.notFound('Organization not found');

            if (!hasPermission(membership.role, permission)) throw AppError.forbidden();

            req.membership = membership;

            next();
        }