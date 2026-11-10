import { UnrecoverableError } from "bullmq";
import { InvitationStatus,  TaskStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { inviteEmail, overdueDigestEmail, welcomeEmail } from "../emails.js";
import type { Mailer } from '../mailer.js';

export interface EmailDeps {
    mailer : Mailer;
}

// A real BullMQ Job satisfies this shape, and so does a plain object in tests
interface JobLike {
    name : String;
    data : unknown;
}

export async function processEmailJob(job : JobLike, deps : EmailDeps) : Promise<void> {
    switch(job.name) {
        case 'welcome': {
            const { userId } = job.data as { userId : string };
            const user = await prisma.user.findUnique({
                where : { id : userId },
                select : { name : true, email : true },
            });

            if (!user) throw new UnrecoverableError(`User ${userId} no longer exists`);

            await deps.mailer.send(welcomeEmail(user));
            return;
        }
    }
}