import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

describe('auth endpoints', () => {
  const unique = `${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  beforeAll(async () => {
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  it('registers a new user', async () => {
    const res = await request(app).post('/api/register').send({
      name: 'Test User',
      email: unique,
      phone: '09123456789',
      password,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(unique);
    expect(res.body.data.user.role).toBe('BUYER');
    expect(res.body.data.token).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/api/register').send({
      name: 'Test User',
      email: unique,
      phone: '09123456789',
      password,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/register').send({
      name: 'Short',
      email: 'short@example.com',
      phone: '09123456789',
      password: 'short',
    });

    expect(res.status).toBe(422);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/login').send({
      email: unique,
      password,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/login').send({
      email: unique,
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('accesses /me with valid token', async () => {
    const loginRes = await request(app).post('/api/login').send({
      email: unique,
      password,
    });
    const token = loginRes.body.data.token;

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(unique);
  });

  it('rejects /me without token', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
  });

  it('rejects /admin for buyer role', async () => {
    const loginRes = await request(app).post('/api/login').send({
      email: unique,
      password,
    });
    const token = loginRes.body.data.token;

    const res = await request(app).get('/api/admin').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
