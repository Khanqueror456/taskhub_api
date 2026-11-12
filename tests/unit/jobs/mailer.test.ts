import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));

vi.mock('../../../src/config/env.js', () => ({
  env: { SMTP_HOST: 'smtp.test', SMTP_PORT: 2525, MAIL_FROM: 'TaskHub Test <test@taskhub.test>' },
}));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

import { createSmtpMailer } from '../../../src/jobs/mailer.js';

const message = { to: 'bob@example.com', subject: 'Hello', text: 'Hi Bob' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.sendMail.mockResolvedValue({});
});

describe('createSmtpMailer', () => {
  it('connects to the SMTP host and port from the environment, without TLS', () => {
    createSmtpMailer();
    expect(mocks.createTransport).toHaveBeenCalledWith({ host: 'smtp.test', port: 2525, secure: false });
  });

  it('sends the message from MAIL_FROM', async () => {
    await createSmtpMailer().send(message);
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: 'TaskHub Test <test@taskhub.test>',
      to: 'bob@example.com',
      subject: 'Hello',
      text: 'Hi Bob',
    });
  });

  it('reuses one transport for every message', async () => {
    const mailer = createSmtpMailer();
    await mailer.send(message);
    await mailer.send(message);
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
  });

  it('lets SMTP failures propagate, so BullMQ can retry the job', async () => {
    mocks.sendMail.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:2525'));
    await expect(createSmtpMailer().send(message)).rejects.toThrow('ECONNREFUSED');
  });
});