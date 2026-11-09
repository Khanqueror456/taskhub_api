import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import type { EmailMessage } from './emails.js';

// Processors depend on this interface, so tests can pass a fake
export interface Mailer {
    send(message : EmailMessage) : Promise<void>;
}

export function createSmtpMailer() : Mailer {
    const transport = nodemailer.createTransport({
        host : env.SMTP_HOST,
        port : env.SMTP_PORT,
        secure : false,
    });

    return {
        async send(message) {
            await transport.sendMail({
                from : env.MAIL_FROM,
                to : message.to,
                subject : message.subject,
                text : message.text
            });
        }
    }
}