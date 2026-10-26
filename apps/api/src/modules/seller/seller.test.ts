import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

describe('seller application and admin approval', () => {
  const buyerEmail = `seller-app-buyer-${Date.now()}@test.local`;
  const adminEmail = `seller-app-admin-${Date.now()}@test.local`;
  const password = 'TestPassword123!';
  let buyerToken: string;
  let adminToken: string;
  let storeId: string;
  const storeSlug = `test-store-${Date.now()}`;

  beforeAll(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.store.deleteMany({});
    await prisma.user.deleteMany({});

    const buyerRes = await request(app).post('/api/register').send({
      name: 'Buyer Applicant',
      email: buyerEmail,
      phone: '09123456789',
      password,
    });
    buyerToken = buyerRes.body.data.token;

    const adminRes = await request(app).post('/api/register').send({
      name: 'Admin User',
      email: adminEmail,
      phone: '09999999999',
      password,
    });
    await prisma.user.update({
      where: { id: adminRes.body.data.user.id },
      data: { role: 'ADMIN' },
    });
    const adminLogin = await request(app).post('/api/login').send({ email: adminEmail, password });
    adminToken = adminLogin.body.data.token;
  });

  afterAll(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.store.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  it('rejects seller apply without auth', async () => {
    const res = await request(app).post('/api/seller/apply').send({ name: 'X', slug: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates a pending store application', async () => {
    const res = await request(app)
      .post('/api/seller/apply')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ name: 'Test Store', slug: storeSlug, description: 'A test store' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.slug).toBe(storeSlug);
    storeId = res.body.data.id;
  });

  it('surfaces pending status to applicant', async () => {
    const res = await request(app)
      .get('/api/seller/store')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].status).toBe('PENDING');
  });

  it('does not expose pending store publicly', async () => {
    const res = await request(app).get(`/api/stores/${storeSlug}`);
    expect(res.status).toBe(404);
  });

  it('rejects admin sellers list for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/sellers')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });

  it('lists sellers for admin', async () => {
    const res = await request(app)
      .get('/api/admin/sellers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((s: { slug: string }) => s.slug === storeSlug)).toBe(true);
  });

  it('requires valid status on update', async () => {
    const res = await request(app)
      .patch(`/api/admin/sellers/${storeId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVALID' });
    expect(res.status).toBe(422);
  });

  it('admin approval activates store', async () => {
    const res = await request(app)
      .patch(`/api/admin/sellers/${storeId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const publicRes = await request(app).get(`/api/stores/${storeSlug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.status).toBe('APPROVED');
  });

  it('rejected status is surfaced to applicant', async () => {
    const rejRes = await request(app)
      .patch(`/api/admin/sellers/${storeId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED' });
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.data.status).toBe('REJECTED');

    const statusRes = await request(app)
      .get('/api/seller/store')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(statusRes.body.data[0].status).toBe('REJECTED');
  });
});