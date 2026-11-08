import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { bullConnection } from './connection.js';


export const EMAIL_QUEUE = 'email';
export const MAINTENANCE_QUEUE = 'maintainance';

export const defaultJobOptions : JobsOptions = {
    attempts : 5,
    backoff : { type : 'exponential', delay : env.JOB_BACKOFF_MS }, // 2s, 4s, 8s, 16s
    removeOnComplete : { age : 24 * 3600, count : 1000}, // keep a day of history
    removeOnFail : { age : 7 * 24 * 3600 }, // keep failures for a week to investigate
};

export const emailQueue = new Queue(EMAIL_QUEUE, {
    connection : bullConnection('producer'),
    defaultJobOptions,
});

export const maintainanceQueue = new Queue(MAINTENANCE_QUEUE, {
    connection : bullConnection('producer'),
    defaultJobOptions,
});

// Without listeners, connection errors become unhandled events
for (const queue of [emailQueue, maintainanceQueue]) {

    queue.on('error', (err) => logger.error({ err, queue : queue.name }, 'Queue error'));
}