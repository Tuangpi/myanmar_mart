import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';
import { signToken } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import { productImageStorage } from '../../lib/product-image-storage.js';

const app = createApp();
const db = getPrisma();
const users: string[] = [];
const keys: string[] = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
);
let token: string, other: string, buyer: string, storeId: string;

beforeAll(async () => {
  for (const role of ['SELLER', 'SELLER', 'BUYER'] as const) {
    const user = await db.user.create({
      data: {
        name: 'Product Test',
        email: `${randomUUID()}@test.local`,
        passwordHash: 'not-used',
        role,
      },
    });
    users.push(user.id);
    const jwt = signToken({ ...user, storeId: null });
    if (users.length === 1) token = jwt;
    else if (users.length === 2) other = jwt;
    else buyer = jwt;
    if (role === 'SELLER') {
      const store = await db.store.create({
        data: { ownerId: user.id, name: 'Product Store', slug: randomUUID(), status: 'APPROVED' },
      });
      if (users.length === 1) storeId = store.id;
    }
  }
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await Promise.all(keys.map((key) => productImageStorage.remove(key)));
  await db.$disconnect();
});
const auth = () => ({ Authorization: `Bearer ${token}` });
async function create(extra = {}) {
  const res = await request(app)
    .post('/api/seller/products')
    .set(auth())
    .send({ name: 'လက်ဖက်ရည်', price: 1500, stock: 4, ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('seller products', () => {
  it('requires authentication and current seller role', async () => {
    expect((await request(app).get('/api/seller/products')).status).toBe(401);
    expect(
      (await request(app).get('/api/seller/products').set('Authorization', `Bearer ${buyer}`))
        .status,
    ).toBe(403);
    await db.user.update({ where: { id: users[2] }, data: { role: 'SELLER' } });
    expect(
      (await request(app).get('/api/seller/products').set('Authorization', `Bearer ${buyer}`))
        .status,
    ).toBe(200);
    await db.user.update({ where: { id: users[2] }, data: { status: 'SUSPENDED' } });
    expect(
      (await request(app).get('/api/seller/products').set('Authorization', `Bearer ${buyer}`))
        .status,
    ).toBe(401);
  });
  it('creates, edits, publishes, updates stock and archives without deleting', async () => {
    const p = await create();
    expect(p.status).toBe('DRAFT');
    expect((await request(app).get(`/api/products/${p.id}`)).status).toBe(404);
    const patch = await request(app)
      .patch(`/api/seller/products/${p.id}`)
      .set(auth())
      .send({ name: 'Tea updated', status: 'ACTIVE' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.stock).toBe(4);
    const priceOnly = await request(app)
      .patch(`/api/seller/products/${p.id}`)
      .set(auth())
      .send({ price: 2000 });
    expect(priceOnly.body.data.status).toBe('ACTIVE');
    expect(priceOnly.body.data.stock).toBe(4);
    expect((await request(app).get(`/api/products/${p.id}`)).status).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/seller/products/${p.id}/stock`)
          .set(auth())
          .send({ stock: 0 })
      ).body.data.stock,
    ).toBe(0);
    expect(
      (await request(app).delete(`/api/seller/products/${p.id}`).set(auth())).body.data.status,
    ).toBe('ARCHIVED');
    expect((await request(app).get(`/api/products/${p.id}`)).status).toBe(404);
    expect(await db.product.findUnique({ where: { id: p.id } })).not.toBeNull();
  });
  it('rejects cross-seller reads, writes, stock, archive and uploads', async () => {
    const p = await create();
    for (const method of ['get', 'patch', 'delete'] as const) {
      expect(
        (
          await request(app)
            [method](`/api/seller/products/${p.id}`)
            .set('Authorization', `Bearer ${other}`)
            .send(method === 'patch' ? { price: 1 } : undefined)
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await request(app)
          .patch(`/api/seller/products/${p.id}/stock`)
          .set('Authorization', `Bearer ${other}`)
          .send({ stock: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/seller/products/${p.id}/images`)
          .set('Authorization', `Bearer ${other}`)
          .attach('image', png, 'a.png')
      ).status,
    ).toBe(404);
    const list = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${other}`);
    expect(list.body.data.total).toBe(0);
  });
  it.each(['PENDING', 'REJECTED', 'SUSPENDED'] as const)(
    'blocks publishing for %s stores',
    async (status) => {
      await db.store.update({ where: { id: storeId }, data: { status } });
      const p = await create();
      expect(
        (
          await request(app)
            .patch(`/api/seller/products/${p.id}`)
            .set(auth())
            .send({ status: 'ACTIVE' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/seller/products')
            .set(auth())
            .send({ name: 'Hidden', price: 1, status: 'ACTIVE' })
        ).status,
      ).toBe(403);
      await db.store.update({ where: { id: storeId }, data: { status: 'APPROVED' } });
    },
  );
  it('validates fields, integer bounds, slugs, categories and pagination', async () => {
    for (const extra of [
      { stock: -1 },
      { price: 1.5 },
      { price: 2147483648 },
      { price: null },
      { stock: true },
      { storeId },
      { slug: '../evil' },
    ]) {
      expect(
        (
          await request(app)
            .post('/api/seller/products')
            .set(auth())
            .send({ name: 'Tea', price: 1, ...extra })
        ).status,
      ).toBe(422);
    }
    expect(
      (
        await request(app)
          .post('/api/seller/products')
          .set(auth())
          .send({ name: 'Tea', price: 1, categoryId: randomUUID() })
      ).status,
    ).toBe(400);
    const slug = randomUUID();
    await create({ slug });
    expect(
      (
        await request(app)
          .post('/api/seller/products')
          .set(auth())
          .send({ name: 'Tea', price: 1, slug })
      ).status,
    ).toBe(409);
    const p = await create();
    expect(
      (await request(app).patch(`/api/seller/products/${p.id}`).set(auth()).send({})).status,
    ).toBe(422);
    expect((await request(app).get('/api/seller/products?page=0').set(auth())).status).toBe(422);
    const list = await request(app).get('/api/seller/products?pageSize=1').set(auth());
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.total).toBeGreaterThan(1);
  });
  it('uploads valid images, rejects spoofing/oversize, and gates public image access', async () => {
    const p = await create();
    const url = `/api/seller/products/${p.id}/images`;
    expect(
      (
        await request(app)
          .post(url)
          .set(auth())
          .attach('image', Buffer.from('evil'), { filename: 'evil.png', contentType: 'image/png' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post(url).set(auth()).attach('image', Buffer.from('<svg/>'), 'evil.svg'))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(url)
          .set(auth())
          .attach('image', Buffer.alloc(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1), 'big.png')
      ).status,
    ).toBe(400);
    const image = await request(app)
      .post(url)
      .set(auth())
      .attach('image', png, { filename: '../../evil.html', contentType: 'image/png' });
    expect(image.status).toBe(201);
    const imageUrl = image.body.data.imageUrl;
    keys.push(imageUrl.split('/').at(-1));
    expect((await request(app).get(imageUrl)).status).toBe(404);
    await request(app).patch(`/api/seller/products/${p.id}`).set(auth()).send({ status: 'ACTIVE' });
    expect((await request(app).get(imageUrl)).status).toBe(200);
    await db.store.update({ where: { id: storeId }, data: { status: 'SUSPENDED' } });
    expect((await request(app).get(imageUrl)).status).toBe(404);
    expect((await request(app).get(`/api/products/${p.id}`)).status).toBe(404);
    await db.store.update({ where: { id: storeId }, data: { status: 'APPROVED' } });
  });
});
