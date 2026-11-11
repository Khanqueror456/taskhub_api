import { logger } from "./config/logger.js";
import { createSmtpMailer } from "./jobs/mailer.js";
import { emailQueue, maintenanceQueue } from "./jobs/queues.js";
import { registerScheules } from "./jobs/scheduler.js";
import { createWorkers } from "./jobs/workers.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

const workers = createWorkers({ mailer : createSmtpMailer() });
await registerScheules();
logger.info('Worker started');

async function shutdown(signal : string) {

    logger.info(`${signal} received, finishing running jobs`);
    setTimeout(() => process.exit(1), 30_000).unref(); // give up after 30s
    await workers.close(); // stop taking jobs, let active ones finish
    await Promise.allSettled([
        emailQueue.close(),
        maintenanceQueue.close(),
        prisma.$disconnect(),
        redis.quit(),
    ]);

    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));