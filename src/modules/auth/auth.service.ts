import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { env } from "../../config/env.js";
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from "../../lib/prisma.js";
import { AppError } from '../../utils/AppError.js';

import {
    generateRefreshToken,
    hashRefreshToken,
    signAccessToken,
} from './tokens.js'


const DUMMY_HASH = await argon2.hash('dummy-password-for-timing');

const publicUser = { id : true, email : true, name : true, createdAt : true} as const;

async function issueTokens(
    userId : string,
    familyId : string,
    db: Prisma.TransactionClient = prisma,
) {

    const refreshToken = generateRefreshToken();
    await db.refreshToken.create({

        data : {

            userId,
            familyId,
            tokenHash : hashRefreshToken(refreshToken),
            expiresAt : new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

        }
    });

    return {
        accessToken : signAccessToken(userId),
        refreshToken,
        expiresIn : env.ACCESS_TOKEN_TTL_SECONDS
    }
}


export async function register(input : { email : string, password : string, name : string})
{
    const passwordHash = await argon2.hash(input.password);

    try {

        const user = await prisma.user.create({
            data : { email : input.email, name : input.name, passwordHash},
            select : publicUser
        });

        const tokens = await issueTokens(user.id, randomUUID());
        
        return { user, ...tokens};
        
    } catch (err) {
        
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        {
            throw AppError.conflict('An account with this email already exists');
        }

        throw err;
    }
}


export async function login(input : { email : string, password : string}) {

    const user = await prisma.user.findUnique({where : {email : input.email}});

    // Always run a verify, even for unknown emails, so response time donesn't reveal
    // which emails are registered

    const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, input.password);

    if (!user || !valid)
    {
        throw AppError.unauthorized('Invalid email or password');
    }

    const tokens = await issueTokens(user?.id, randomUUID());

    return {
        user : { id : user.id, email : user.email, name : user.name, createAt : user.createdAt },
        ...tokens,
    };

}


export async function refresh(refreshToken : string) {

    const stored = await prisma.refreshToken.findUnique({
        where : { tokenHash : hashRefreshToken(refreshToken)}
    });

    if (!stored) throw AppError.unauthorized('Invalid refresh token');

    if (stored.revokedAt)
    {
        // A revoked token is being reused: assume theft and kill the whole session family

        await prisma.refreshToken.updateMany({
            where : { familyId : stored.familyId, revokedAt : null},
            data : { revokedAt : new Date()}
        })

        throw AppError.unauthorized('Refresh token resue detected. Please log in again');
    }

    if (stored.expiresAt < new Date())
    {
        throw AppError.unauthorized('Refresh token expired');
    }

    return prisma.$transaction(async (tx) => {

        // Compare-and-set : only one concurrent request can with this revoke

        const { count } = await tx.refreshToken.updateMany({
            where : { id : stored.id, revokedAt : null},
            data : { revokedAt : new Date()},
        });

        if (count === 0)
        {
            throw AppError.unauthorized('Refresh token  already used');
        }

        return issueTokens(stored?.userId, stored?.familyId, tx);
    });
}

export async function logout(refreshToken : string) {

    // Idempotent : unknown or already-revoked tokens are fine

    await prisma.refreshToken.updateMany({
        where : { tokenHash : hashRefreshToken(refreshToken), revokedAt : null},
        data : { revokedAt : new Date()}
    }
    )
};


export async function getMe(userId : string)
{
    const user = prisma.user.findUnique({ where : { id : userId}, select : publicUser});

    if (!user) throw AppError.unauthorized();

    return user;
}