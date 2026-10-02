import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal : string) {

  logger.info(`${signal} received, shutting down`);
  server.close((async () => {
    await prisma.$disconnect();
    process.exit(0);
  }));

  setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if requests hang
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));