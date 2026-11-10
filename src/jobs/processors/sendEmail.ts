import { UnrecoverableError } from "bullmq";
import { InvitationStatus, TaskStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { inviteEmail, overdueDigestEmail, welcomeEmail } from "../emails.js";
import type { Mailer } from "../mailer.js";


export interface EmailDeps {
    mailer : Mailer;
}

// A real BullMQ Job satisfies this shape, and so does a plain object in tests
interface JobLike {
    name : string;
    data : unknown;
}

export async function processEmailJob(job: JobLike, deps : EmailDeps) : Promise<void> {

    switch(job.name) {
        case 'welcome' : {
            const { userId } = job.data as { userId : string };
            const user = await prisma.user.findUnique({
                where : { id : userId },
                select : { name : true, email : true },
            });

            if (!user) throw new UnrecoverableError(`User ${userId} no longer exists`);

            await deps.mailer.send(welcomeEmail(user));
            return;
        }

        case 'invite' : {
            const { invitationId, token } = job.data as { invitationId : string, token : string };
            const invitation = await prisma.invitation.findUnique({
                where : { id : invitationId },
                include : {
                    organization : { select : { name : true } },
                    invitedBy : { select : { name : true }}
                }
            });

            // Revoked, accepted, expired or deleted while the job waited: never send it
            if (
                !invitation ||
                invitation.status !== InvitationStatus.PENDING ||
                invitation.expiresAt <  new Date()
            ) {
                throw new UnrecoverableError('Invitation no longer valid');
            }

            await deps.mailer.send(
                inviteEmail({
                    to : invitation.email,
                    orgName : invitation.organization.name,
                    inviterName : invitation.invitedBy?.name ?? 'A teamate',
                    role : invitation.role,
                    token
                })
            );
            return;
        }

        case 'overdue-digest' : {
            const { userId } = job.data as { userId : string, date : string };
            const user = await prisma.user.findUnique({
                where : { id : userId },
                select : { name : true, email : true },
            });

            if (!user) throw new UnrecoverableError(`User ${userId} no longer exists`);

            // Tasks are read fresh: they may have been completed since the scan queued this job
            const tasks = await prisma.task.findMany({
                where : {
                    assigneeId : userId,
                    status : { not : TaskStatus.DONE },
                    dueDate : { lt : new Date() },
                },
                orderBy : { dueDate : 'asc' },
                take : 50,
                select : { title : true, dueDate : true, organization : { select : { name : true }}},
            });
            if (tasks.length === 0) return; // nothing to say

            await deps.mailer.send(overdueDigestEmail(user, tasks));
            return;
        }

        default:
            throw new UnrecoverableError(`Unknown email job : ${job.name}`);
    }
}