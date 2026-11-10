import { TaskStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { emailQueue } from "../queues.js";

/**
 * Finds users with overdue, unfinished tasks and queues one digest per user per day.
 * The job id contains the date, so running the scan twice in a day queues nothing new.
 * Note: this is the one place that deliberately reads across all tenants. It runs only
 * in trusted worker code, and each digest only contains the recipient's own tasks.
 */

export async function scanOverdue(now = new Date()) : Promise<number> {

    const rows = await prisma.task.findMany({
        where : { assigneeId : { not : null }, status : { not : TaskStatus.DONE }, dueDate : { lt : now }},
        distinct : ['assigneeId'],
        select : { assigneeId : true },
    });

    const date = now.toISOString().slice(0, 10);
    const jobs = rows.flatMap((r) => 
        r.assigneeId ? [
            {
                name : 'overdue-digest',
                data : { userId : r.assigneeId, date },
                opts : { jobId : `overdue-${r.assigneeId}-${date}` },
            },
        ] : [],
    );

    if (jobs.length > 0) await emailQueue.addBulk(jobs);
    return jobs.length;
}