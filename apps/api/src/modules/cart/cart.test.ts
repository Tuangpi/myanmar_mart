import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';
import { signToken } from '../../lib/jwt.js';

const db = getPrisma();
const app = createApp();
const users: string[] = [];
const tokens: string[] = [];
let storeId: string;

beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: { name: 'Cart test', email: `${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    users.push(user.id);
    tokens.push(signToken({ ...user, storeId: null }));
  }
  const store = await db.store.create({
    data: { ownerId: users[0]!, name: 'Cart store', slug: randomUUID(), status: 'APPROVED' },
  });
  storeId = store.id;
});

afterAll(async () => {
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

async function product(stock = 5) {
  return db.product.create({
    data: { storeId, name: 'Cart tea', slug: randomUUID(), price: 1500, stock, status: 'ACTIVE' },
  });
}
function add(productId: string, quantity = 1) {
  return request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${tokens[0]}`)
    .send({ productId, quantity });
}
function itemRequest(method: 'patch' | 'delete', id: string, user = 0) {
  return request(app)
    [method](`/api/cart/items/${id}`)
    .set('Authorization', `Bearer ${tokens[user]}`);
}

describe('cart', () => {
  it('requires authentication on every route and returns an empty personal cart', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const path =
        method === 'get'
          ? '/api/cart'
          : method === 'post'
            ? '/api/cart/items'
            : `/api/cart/items/${randomUUID()}`;
      expect((await request(app)[method](path)).status).toBe(401);
    }
    const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${tokens[0]}`);
    expect(res.body.data).toEqual({ items: [], itemCount: 0, subtotal: 0 });
  });

  it('adds, merges, updates and removes with server prices and no stock reservation', async () => {
    const p = await product();
    expect((await add(p.id, 2)).status).toBe(201);
    const merged = await add(p.id);
    const item = merged.body.data.items.find(
      (row: { productId: string }) => row.productId === p.id,
    );
    expect(item).toMatchObject({ quantity: 3, unitPrice: 1500, subtotal: 4500 });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
    await db.product.update({ where: { id: p.id }, data: { price: 2000 } });
    const updated = await itemRequest('patch', item.id).send({ quantity: 5 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.items.find((row: { id: string }) => row.id === item.id)).toMatchObject(
      { quantity: 5, unitPrice: 2000, subtotal: 10000 },
    );
    expect((await add(p.id)).status).toBe(409);
    expect((await itemRequest('patch', item.id).send({ quantity: 6 })).status).toBe(409);
    expect((await itemRequest('delete', item.id)).status).toBe(200);
    expect((await itemRequest('delete', item.id)).status).toBe(404);
  });

  it('isolates users and rejects foreign item mutations', async () => {
    const p = await product();
    const res = await add(p.id);
    const item = res.body.data.items.find((row: { productId: string }) => row.productId === p.id);
    const other = await request(app).get('/api/cart').set('Authorization', `Bearer ${tokens[1]}`);
    expect(other.body.data.items).toEqual([]);
    expect((await itemRequest('patch', item.id, 1).send({ quantity: 2 })).status).toBe(404);
    expect((await itemRequest('delete', item.id, 1)).status).toBe(404);
  });

  it('rejects invalid quantities, identifiers and client-supplied prices', async () => {
    const p = await product();
    for (const quantity of [0, -1, 1.5, '2', null, 2147483648]) {
      expect(
        (
          await request(app)
            .post('/api/cart/items')
            .set('Authorization', `Bearer ${tokens[0]}`)
            .send({ productId: p.id, quantity })
        ).status,
      ).toBe(422);
    }
    expect((await add('invalid')).status).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${tokens[0]}`)
          .send({ productId: p.id, quantity: 1, price: 1 })
      ).status,
    ).toBe(422);
    const res = await add(p.id);
    const item = res.body.data.items.find((row: { productId: string }) => row.productId === p.id);
    expect((await itemRequest('patch', item.id).send({ quantity: 0 })).status).toBe(422);
    expect((await itemRequest('delete', 'invalid')).status).toBe(422);
  });

  it('serializes concurrent first adds and enforces the cumulative stock cap', async () => {
    const p = await product(3);
    const firstAdd = () =>
      request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${tokens[1]}`)
        .send({ productId: p.id, quantity: 2 });
    const results = await Promise.all([firstAdd(), firstAdd()]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const rows = await db.cartItem.findMany({
      where: { productId: p.id, cart: { userId: users[1] } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(2);
    expect(await db.cart.count({ where: { userId: users[1] } })).toBe(1);
  });

  it('rejects unavailable products but retains stale items for removal', async () => {
    expect((await add(randomUUID())).status).toBe(409);
    const zero = await product(0);
    expect((await add(zero.id)).status).toBe(409);
    const p = await product();
    const res = await add(p.id, 3);
    const item = res.body.data.items.find((row: { productId: string }) => row.productId === p.id);
    await db.product.update({ where: { id: p.id }, data: { stock: 1 } });
    expect((await itemRequest('patch', item.id).send({ quantity: 2 })).status).toBe(409);
    expect((await itemRequest('patch', item.id).send({ quantity: 1 })).status).toBe(200);
    for (const status of ['DRAFT', 'ARCHIVED'] as const) {
      await db.product.update({ where: { id: p.id }, data: { status } });
      expect((await add(p.id)).status).toBe(409);
    }
    await db.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
    for (const status of ['PENDING', 'REJECTED', 'SUSPENDED'] as const) {
      await db.store.update({ where: { id: storeId }, data: { status } });
      expect((await add(p.id)).status).toBe(409);
    }
    const snapshot = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${tokens[0]}`);
    expect(
      snapshot.body.data.items.find((row: { id: string }) => row.id === item.id).available,
    ).toBe(false);
    expect((await itemRequest('delete', item.id)).status).toBe(200);
    await db.store.update({ where: { id: storeId }, data: { status: 'APPROVED' } });
  });
});
