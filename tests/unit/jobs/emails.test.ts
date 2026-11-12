import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: { APP_URL: 'https://app.example.test' },
}));

import { inviteEmail, overdueDigestEmail, welcomeEmail } from '../../../src/jobs/emails.js';

describe('welcomeEmail', () => {
  it('greets the user by name and is addressed to their email', () => {
    const mail = welcomeEmail({ name: 'Ada', email: 'ada@example.com' });
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toBe('Welcome to TaskHub');
    expect(mail.text).toContain('Hi Ada,');
  });
});

describe('inviteEmail', () => {
  const mail = inviteEmail({
    to: 'bob@example.com',
    orgName: 'Acme',
    inviterName: 'Ada',
    role: 'MEMBER',
    token: 'tok_123',
  });

  it('is addressed to the invitee and names the inviter and organization in the subject', () => {
    expect(mail.to).toBe('bob@example.com');
    expect(mail.subject).toBe('Ada invited you to Acme on TaskHub');
  });

  it('explains who invited whom, to what, and as which role', () => {
    expect(mail.text).toContain('Ada invited you to join Acme as MEMBER.');
  });

  it('contains an accept link built from APP_URL and the token', () => {
    expect(mail.text).toContain('Accept here: https://app.example.test/accept-invite?token=tok_123');
  });

  it('tells API users which account must accept, and when the invitation expires', () => {
    expect(mail.text).toContain('signed in as bob@example.com');
    expect(mail.text).toContain('expires in 7 days');
  });
});

describe('overdueDigestEmail', () => {
  const user = { name: 'Ada', email: 'ada@example.com' };
  const task = (title: string, org: string) => ({
    title,
    dueDate: new Date('2020-01-01T00:00:00Z'),
    organization: { name: org },
  });

  it('uses the singular for one task', () => {
    expect(overdueDigestEmail(user, [task('Fix login', 'Acme')]).subject).toBe('You have 1 overdue task');
  });

  it('uses the plural for several tasks', () => {
    const mail = overdueDigestEmail(user, [task('Fix login', 'Acme'), task('Ship docs', 'Globex')]);
    expect(mail.subject).toBe('You have 2 overdue tasks');
  });

  it('lists each task with its organization and due date', () => {
    const mail = overdueDigestEmail(user, [task('Fix login', 'Acme'), task('Ship docs', 'Globex')]);
    expect(mail.text).toContain('- [Acme] Fix login (due 2020-01-01)');
    expect(mail.text).toContain('- [Globex] Ship docs (due 2020-01-01)');
  });

  it('is addressed to the user and greets them by name', () => {
    const mail = overdueDigestEmail(user, [task('Fix login', 'Acme')]);
    expect(mail.to).toBe('ada@example.com');
    expect(mail.text).toContain('Hi Ada,');
  });
});