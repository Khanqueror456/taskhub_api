import { randomBytes } from "node:crypto";
import { Prisma, Role} from "../../generated/prisma/client.js";
import { prisma } from '../../lib/prisma.js';
import { AppError } from "../../utils/AppError.js";
import { email } from "zod";

function makeSlug(name: string) : string {

    const base = 
    name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40) || 'org';

    return `${base}-${randomBytes(3).toString('hex')}`;
}


const memberSelect = {

    role : true,
    createdAt : true,
    user : { select : { id : true, email : true, name : true }}
} as const;

function toMember(m : {
    role : Role;
    createdAt : Date;
    user : { id : string; email : string; name : string};
}) {

    return {

        userId : m.user.id,
        email : m.user.email,
        name : m.user.name,
        role : m.role,
        joinedAt : m.createdAt
    };
}


// ---------------- organizations ---------------


export async function createOrganization(userId : string, name : string) {

    // Both rows or netiher : an org without an owner would be unreachable

    return prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data : { name, slug : makeSlug(name)}});
        await tx.membership.create({
            data : { userId, organizationId : org.id, role : Role.OWNER},
        });

        return { ...org, role : Role.OWNER};
    });
}


export async function listMyOrganizations(userId : string) {

    const memberships = await prisma.membership.findMany({
        where : { userId },
        include : { organization : true},
        orderBy : { createdAt : 'desc'},
    });

    return memberships.map((m) => ({ ...m.organization, role : m.role}));
}


export async function getOrganization(orgId : string) {

    const org = await prisma.organization.findUnique({ where : { id : orgId}});

    if (!org) throw AppError.notFound('Organization not found');
    return org;
}

export async function updateOrganization(orgId : string, name : string) {
    return prisma.organization.update({ where : { id : orgId}, data : { name }});
}

export async function deleteOrganization(orgId : string) {
    await prisma.organization.delete({ where : { id : orgId }}) // memberships cascade
}


// ---------------- members -----------------


export async function listMembers(orgId : string) {

    const members = await prisma.membership.findMany({
        where : { organizationId : orgId },
        select : memberSelect,
        orderBy : { createdAt : 'asc'}
    })

    return members.map(toMember);
}



export async function addMember(orgId : string, input : { email : string, role : Role}) {

    const user = await prisma.user.findUnique({
        where : { email : input.email},
        select : { id : true}
    });

    if (!user) throw AppError.notFound('No registered user with that email');

    try {

        const created = await prisma.membership.create({
            data : { userId : user.id, organizationId : orgId, role : input.role },
            select : memberSelect
        });

        return toMember(created);
        
    } catch (err) {

        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        {
            throw AppError.conflict('User is already a member of this organization');
        }

        throw err;
        
    }
}




async function findTargetMembership(orgId : string, userId : string) {

    // Scoped by BOTH ids, so and ID from another org can never match

    const target = await prisma.membership.findUnique({
        where : { userId_organizationId : { userId, organizationId : orgId }},
    });

    if (!target) throw AppError.notFound('Member not found');
    return target;
}

export async function updateMemberRole(orgId : string, userId : string, role : Role) {

    const target = await findTargetMembership(orgId, userId);

    if (target.role === Role.OWNER) throw AppError.forbidden("The owner's role cannot be changed");

    const updated = await prisma.membership.update({
        where : { id : target.id },
        data : { role },
        select : memberSelect
    });

    return toMember(updated);
}




