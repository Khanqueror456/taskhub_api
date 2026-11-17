import { execSync } from 'node:child_process';
import { Redis } from 'ioredis';
import pg from 'pg';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './testEnv.js';

const { Client } = pg;

export default async function setup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  const redisDb = Number(new URL(TEST_REDIS_URL).pathname.slice(1) || 0);

  // This setup DELETES data. Refuse anything that is not clearly a test database.
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to run: database "${dbName}" must match *_test`);
  }
  if (redisDb === 0) {
    throw new Error('Refusing to run: tests must use a Redis database other than 0');
  }

  // 1. Create the database if it does not exist yet
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  // 2. Apply every migration (an existing, up-to-date database is a quick no-op)
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  // 3. Start from empty tables. CASCADE clears everything that references these three.
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query('TRUNCATE TABLE users, organizations, audit_logs RESTART IDENTITY CASCADE');
  await db.end();

  // 4. Start from an empty Redis test database
  const redis = new Redis(TEST_REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}