import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

const email = `test-${randomUUID()}@example.com`;
const password = 'correct-horse-battery';
const api = '/api/v1/auth';

let accessToken: string;
let refreshToken: string;
let rotatedRefreshToken: string;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } }); // cascades to refresh_tokens
  await prisma.$disconnect();
});

describe('auth flow', () => {
  it('registers a user and returns tokens without the password hash', async () => {
    const res = await request(app).post(`${api}/register`).send({ email, password, name: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    ({ accessToken, refreshToken } = res.body);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app).post(`${api}/register`).send({ email, password, name: 'Test' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid input with 400', async () => {
    const res = await request(app).post(`${api}/register`).send({ email: 'nope', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post(`${api}/login`).send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('protects /me', async () => {
    expect((await request(app).get(`${api}/me`)).status).toBe(401);
    const ok = await request(app).get(`${api}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
  });

  it('rotates the refresh token', async () => {
    const res = await request(app).post(`${api}/refresh`).send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);
    rotatedRefreshToken = res.body.refreshToken;
  });

  it('detects reuse of an old refresh token and revokes the whole family', async () => {
    const reuse = await request(app).post(`${api}/refresh`).send({ refreshToken });
    expect(reuse.status).toBe(401);

    const afterRevoke = await request(app)
      .post(`${api}/refresh`)
      .send({ refreshToken: rotatedRefreshToken });
    expect(afterRevoke.status).toBe(401);
  });
});