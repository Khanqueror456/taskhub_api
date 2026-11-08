import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  RATE_LIMIT_ENABLED : z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  TRUST_PROXY_HOPS : z.coerce.number().int().min(0).default(0),
  SMTP_HOST : z.string().default('localhost'),
  SMTP_PORT : z.coerce.number().default(1025),
  MAIL_FROM : z.string().default("TashHub <no-reply@taskhub.local>"),
  APP_URL : z.string().url().default("http://localhost:3000"),
  JOB_BACKOFF_MS : z.coerce.number().int().positive().default(2000),
  OVERDUE_SCAN_CRON : z.string().default('0 8 * * *'), // every day at 08 : 00
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;