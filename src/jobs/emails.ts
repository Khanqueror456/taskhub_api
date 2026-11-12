import { env } from '../config/env.js';

export interface EmailMessage {
    to: string;
    subject: string;
    text: string;
}

export const welcomeEmail = (user: { name: string; email: string }): EmailMessage => ({
    to: user.email,
    subject: 'Welcome to TaskHub',
    text: `Hi ${user.name}, \n\nYour TaskHub account is ready. Create an organization or wait for an invitation to join one.\n`
});

export const inviteEmail = (a: {
    to: string;
    orgName: string;
    inviterName: string;
    role: string;
    token: string;
}): EmailMessage => ({
    to: a.to,
    subject: `${a.inviterName} invited you to ${a.orgName} on TaskHub`,
    text:
        `${a.inviterName} invited you to join ${a.orgName} as ${a.role}.\n\n` +
        `Accept here: ${env.APP_URL}/api/v1/invitations/accept?token=${a.token}\n\n` +
        `(API clients: POST /api/v1/invitations/accept with {"token": "${a.token}"} while signed in as ${a.to}.)\n` +
        `This invitation expires in 7 days.\n`,
});

export function overdueDigestEmail(
    user: { name: string; email: string },
    tasks: { title: string; dueDate: Date | null; organization: { name: string } }[],
): EmailMessage {
    const lines = tasks.map(
        (t) => `- [${t.organization.name}] ${t.title} (due ${t.dueDate?.toISOString().slice(0, 10)})`,
    );

    return {
        to: user.email,
        subject: `You have ${tasks.length} overdue task${tasks.length === 1 ? '' : 's'}`,
        text: `Hi ${user.name}, \n\nThese tasks are past their due date:\n\n${lines.join('\n')}\n`,
    }
}