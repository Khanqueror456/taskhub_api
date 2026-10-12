import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../src/app.js'
import { prisma } from "../../src/lib/prisma.js"

export interface TestUser {

    id : string;
    email : string;
    token : string;
};


export async function createUser() : Promise<TestUser> {

    const email = `test-${randomUUID()}@example.com`;
    const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password : 'correct-horse-battery', name : 'Test User'});

    return { id : res.body.user.id, email, token : res.body.accessToken };
}

export async function cleanupUsers(ids : string[]) {
    const memberships = await prisma.membership.findMany({
        where : { userId : { in : ids }},
        select : { organizationId : true}
    })

    // Delete orgs first(cascades memberships), otherwise they'd be left orphaned
    await prisma.organization.deleteMany({
        where : { id : { in : memberships.map((m) => m.organizationId) } },
    });

    await prisma.user.deleteMany({ where : { id : { in : ids } } } );
}