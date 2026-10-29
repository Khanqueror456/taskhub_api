// One shared client for the whole app. Never create new PrismaClient() per request.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter, log : ['query'] });

// d981ec45-3aba-4e8b-83b8-e51d5073b2a2
// 42bcd0d4-2c9e-463d-841b-d03e2b5f8066