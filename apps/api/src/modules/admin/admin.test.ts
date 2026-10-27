import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

describe('admin authorization and reports', () => {
  const password = 'TestPassword123!';
  const buyerEmail = `admin-auth-buyer-${Date.now()}@test.local`;
  const sellerEmail = `admin-auth-seller-${Date.now()}@test.local`;
  const adminEmail = `admin-auth-admin-${Date.now()}@test.local`;
  let buyerToken = '';
  let sellerToken = '';
  let adminToken = '';

  beforeAll(async () => {
    const buyerRes = await request(app).post('/api/register').send({
      name: 'Buyer',
      email: buyerEmail,
      phone: '09123456789',
      password,
    });
    buyerToken = buyerRes.body.data.token;

    const sellerRes = await request(app).post('/api/register').send({
      name: 'Seller',
      email: sellerEmail,
      phone: '09123456789',
      password,
    });
    await prisma.user.update({ where: { id: sellerRes.body.data.user.id }, data: { role: 'SELLER' } });
    const sellerLogin = await request(app).post('/api/login').send({ email: sellerEmail, password });
    sellerToken = sellerLogin.body.data.token;

    const adminRes = await request(app).post('/api/register').send({
      name: 'Admin',
      email: adminEmail,
      phone: '09999999999',
      password,
    });
    await prisma.user.update({ where: { id: adminRes.body.data.user.id }, data: { role: 'ADMIN' } });
    const adminLogin = await request(app).post('/api/login').send({ email: adminEmail, password });
    adminToken = adminLogin.body.data.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [buyerEmail, sellerEmail, adminEmail] } },
    });
    await prisma.$disconnect();
  });

  const getRoutes = [
    '/api/admin/sellers',
    '/api/admin/products?page=1&pageSize=5',
    '/api/admin/orders?page=1&pageSize=5',
    '/api/admin/payments?page=1&pageSize=5',
    '/api/admin/audit?page=1&pageSize=5',
    '/api/admin/audit-logs?page=1&pageSize=5',
    '/api/admin/reports',
    '/api/admin/report',
  ];

  for (const route of getRoutes) {
    it(`rejects ${route} without auth`, async () => {
      expect((await request(app).get(route)).status).toBe(401);
    });
    it(`rejects ${route} for buyer`, async () => {
      expect((await request(app).get(route).set('Authorization', `Bearer ${buyerToken}`)).status).toBe(403);
    });
    it(`rejects ${route} for seller`, async () => {
      expect((await request(app).get(route).set('Authorization', `Bearer ${sellerToken}`)).status).toBe(403);
    });
    it(`allows admin to read ${route}`, async () => {
      expect((await request(app).get(route).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
    });
  }

  for (const route of ['/api/admin/sellers/invalid/status', '/api/admin/products/invalid/status']) {
    it(`rejects ${route} for buyer and seller`, async () => {
      expect(
        (await request(app).patch(route).set('Authorization', `Bearer ${buyerToken}`).send({ status: 'APPROVED' }))
          .status,
      ).toBe(403);
      expect(
        (await request(app).patch(route).set('Authorization', `Bearer ${sellerToken}`).send({ status: 'APPROVED' }))
          .status,
      ).toBe(403);
    });
  }
});
