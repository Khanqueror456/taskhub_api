import { logger } from "../config/logger.js";
import { emailQueue } from "./queues.js";


// Enqueue AFTER the database commit. A queue problme is logged, never thrown at the user
async function safely(label : string, add : () => Promise<unknown>) : Promise<boolean> {

    try {
        await add();
        return true;
    } catch (err) {
        logger.error({err, label}, "Failed to enqueue job");
        return false;
    }
}


export const enqueueWelcomeEmail = (userId : string) => 
    safely('welcome', () => emailQueue.add('welcome', { userId }, { jobId : `welcome-${userId}`}));

export const enqueueInviteEmail = (invitationId : string, token : string) => 
    safely('invite', () => emailQueue.add('invite', { invitationId, token }, { jobId : `invite-${invitationId}`}))