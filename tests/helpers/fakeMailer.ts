import type { EmailMessage } from '../../src/jobs/emails.js';
import type { Mailer } from '../../src/jobs/mailer.js';

export class FakeMailer implements Mailer {
    sent : EmailMessage[] = [];
    attempts = 0;
    failuresLeft = 0;

    async send(message : EmailMessage) {
        this.attempts++;

        if (this.failuresLeft > 0) {
            this.failuresLeft--;
            throw new Error('SMTP down');
        }

        this.sent.push(message);
    }
}