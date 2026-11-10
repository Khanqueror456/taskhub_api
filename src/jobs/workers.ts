import { UnrecoverableError, Worker } from "bullmq";
import { logger } from "../config/logger.js";
import { bullConnection } from "./connection.js";
import { scanOverdue } from "./processors/scanOverdue.js";
import { processEmailJob, type EmailDeps } from "./processors/sendEmail.js";
import { EMAIL_QUEUE, MAINTENANCE_QUEUE } from "./queues.js";


export function createWorkers(deps : EmailDeps) {
    const emailWorker = new Worker(EMAIL_QUEUE, (job) => processEmailJob(job, deps), {
        connection : bullConnection('worker'),
        concurrency : 5, // up to five emails at once
    });

    const maintenanceWorker = new Worker(
        MAINTENANCE_QUEUE,
        async (job) => {
            if (job.name === 'scan-overdue') return { queued : await scanOverdue() };
            throw new UnrecoverableError(`Unkown maintenance job: ${job.name}`);
        },
        { connection : bullConnection('worker'), concurrency : 1 },
    );

    const workers = [emailWorker, maintenanceWorker];

    for (const worker of workers) {
        worker.on('completed', (job) => {
            logger.info({ queue : worker.name, jobId : job.id, name : job.name }, 'Job completed');
        });
        worker.on('failed', (job, err) => {
            const willRetry = 
            !(err instanceof UnrecoverableError) && (job?.attemptsMade ?? 0) < (job?.opts.attempts ?? 1);
            logger[willRetry ? 'warn' : 'error'](
                { queue : Worker.name, jobId : job?.id, name : job?.name, attempt : job?.attemptsMade, willRetry, err },
                willRetry ? 'Job failed, will retry' : 'Job failed permanently',
            );
        });
        worker.on('error', (err) => logger.error({ err, queue : worker.name }, 'Worker error'));
    }

    return {
        emailWorker,
        maintenanceWorker,
        close : () => Promise.all(workers.map((w) => w.close())) // waits for running jobs to finish
    };
}