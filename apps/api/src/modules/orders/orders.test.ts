import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';
import { signToken } from '../../lib/jwt.js';
import { env } from '../../config/env.js';

const app = createApp();
const db = getPrisma();
const users: string[] = [];
const tokens: string[] = [];
const stores: string[] = [];
const address = {
  recipientName: 'Buyer One',
  phone: '09123456789',
  region: 'Yangon',
  city: 'Hlaing',
  address: '123 Main Street',
  notes: 'Call first',
};
const input = { address, paymentMethod: 'COD' };
const originalFee = env.DELIVERY_FEE_MMK;

beforeAll(async () => {
  for (let i = 0; i < 3; i++) {
    const user = await db.user.create({
      data: { name: 'Checkout test', email: `${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    users.push(user.id);
    tokens.push(signToken({ ...user, storeId: null }));
    if (i < 2)
      stores.push(
        (
          await db.store.create({
            data: { ownerId: user.id, name: `Store ${i}`, slug: randomUUID(), status: 'APPROVED' },
          })
        ).id,
      );
  }
  env.DELIVERY_FEE_MMK = 2500;
});
beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: users } } } });
});
afterAll(async () => {
  env.DELIVERY_FEE_MMK = originalFee;
  await db.order.deleteMany({ where: { buyerId: { in: users } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

function api(method: 'get' | 'post', path: string, user = 0) {
  return request(app)[method](path).set('Authorization', `Bearer ${tokens[user]}`);
}
async function product(store = 0, price = 1500, stock = 5) {
  return db.product.create({
    data: {
      storeId: stores[store]!,
      name: 'Tea',
      slug: randomUUID(),
      price,
      stock,
      status: 'ACTIVE',
    },
  });
}
async function add(productId: string, quantity = 1, user = 0) {
  expect((await api('post', '/api/cart/items', user).send({ productId, quantity })).status).toBe(
    201,
  );
}

describe('checkout and orders', () => {
  async function placed(paymentMethod = 'COD') {
    const p = await product();
    await add(p.id, 2);
    const response = await api('post', '/api/orders').send({ address, paymentMethod });
    expect(response.status).toBe(201);
    return { p, order: response.body.data };
  }

  it('cancels an eligible order, restores stock once and records history', async () => {
    const { p, order } = await placed();
    expect(order.canCancel).toBe(true);
    const res = await api('post', `/api/orders/${order.id}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', canCancel: false });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
    expect((await api('post', `/api/orders/${order.id}/cancel`).send({})).status).toBe(409);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
    const history = await db.orderStatusHistory.findMany({
      where: { orderId: order.id, newStatus: 'CANCELLED' },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldStatus: 'CONFIRMED', changedBy: users[0] });
  });

  it('requires authentication and ownership for cancellation', async () => {
    const { p, order } = await placed();
    expect((await request(app).post(`/api/orders/${order.id}/cancel`)).status).toBe(401);
    expect((await api('post', `/api/orders/${order.id}/cancel`, 1).send({})).status).toBe(404);
    expect((await api('post', `/api/orders/${randomUUID()}/cancel`).send({})).status).toBe(404);
    expect((await api('post', '/api/orders/invalid/cancel').send({})).status).toBe(422);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(3);
  });

  it('allows unpaid prepaid cancellation but blocks later statuses and payment attempts', async () => {
    const { order } = await placed('KBZPAY');
    expect((await api('post', `/api/orders/${order.id}/cancel`).send({})).status).toBe(200);
    const { p, order: blocked } = await placed();
    for (const status of [
      'PAYMENT_SUBMITTED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ] as const) {
      await db.order.update({ where: { id: blocked.id }, data: { status } });
      expect((await api('get', `/api/orders/${blocked.id}`)).body.data.canCancel).toBe(false);
      expect((await api('post', `/api/orders/${blocked.id}/cancel`).send({})).status).toBe(409);
    }
    await db.order.update({
      where: { id: blocked.id },
      data: { status: 'CONFIRMED', paymentStatus: 'VERIFIED' },
    });
    expect((await api('post', `/api/orders/${blocked.id}/cancel`).send({})).status).toBe(409);
    await db.order.update({
      where: { id: blocked.id },
      data: {
        paymentStatus: 'PENDING',
        payments: { create: { method: 'COD', amount: blocked.total, status: 'SUBMITTED' } },
      },
    });
    expect((await api('post', `/api/orders/${blocked.id}/cancel`).send({})).status).toBe(409);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(3);
  });

  it('serializes competing cancellations and restores multi-seller inventory exactly once', async () => {
    const first = await product();
    const second = await product(1);
    await add(first.id, 2);
    await add(second.id, 1);
    const created = await api('post', '/api/orders').send(input);
    const id = created.body.data.id;
    const results = await Promise.all([
      api('post', `/api/orders/${id}/cancel`).send({}),
      api('post', `/api/orders/${id}/cancel`).send({}),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    for (const p of [first, second])
      expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
    expect(
      await db.orderStatusHistory.count({ where: { orderId: id, newStatus: 'CANCELLED' } }),
    ).toBe(1);
  });

  it('rolls back cancellation if restoring inventory would overflow', async () => {
    const { p, order } = await placed();
    await db.product.update({ where: { id: p.id }, data: { stock: 2147483647 } });
    expect((await api('post', `/api/orders/${order.id}/cancel`).send({})).status).toBe(409);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(
      await db.orderStatusHistory.count({ where: { orderId: order.id, newStatus: 'CANCELLED' } }),
    ).toBe(0);
  });

  it('can cancel orders retaining snapshots of deleted products', async () => {
    const { p, order } = await placed();
    await db.product.delete({ where: { id: p.id } });
    const result = await api('post', `/api/orders/${order.id}/cancel`).send({});
    expect(result.status).toBe(200);
    expect(result.body.data.sellerGroups[0].items[0]).toMatchObject({
      productId: null,
      productName: 'Tea',
    });
  });

  it('rolls back earlier stock restorations when a later product cannot be restored', async () => {
    const products = [await product(), await product(1)].sort((a, b) => a.id.localeCompare(b.id));
    for (const p of products) await add(p.id);
    const created = await api('post', '/api/orders').send(input);
    const id = created.body.data.id;
    await db.product.update({ where: { id: products[1]!.id }, data: { stock: 2147483647 } });
    expect((await api('post', `/api/orders/${id}/cancel`).send({})).status).toBe(409);
    expect((await db.product.findUniqueOrThrow({ where: { id: products[0]!.id } })).stock).toBe(4);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
    expect(
      await db.orderStatusHistory.count({ where: { orderId: id, newStatus: 'CANCELLED' } }),
    ).toBe(0);
  });

  it('requires authentication and validates address, payment and identifiers', async () => {
    for (const path of ['/api/checkout', '/api/orders', `/api/orders/${randomUUID()}`])
      expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post('/api/orders').send(input)).status).toBe(401);
    for (const body of [
      {},
      { ...input, address: { ...address, phone: '' } },
      { ...input, paymentMethod: 'FREE' },
    ]) {
      expect((await api('post', '/api/orders').send(body)).status).toBe(422);
    }
    expect((await api('get', '/api/orders/invalid')).status).toBe(422);
    expect((await api('get', '/api/orders?page=0')).status).toBe(422);
    expect((await api('post', '/api/orders').send(input)).status).toBe(409);
  });

  it('creates one two-seller order with snapshots, server prices, delivery fee and history', async () => {
    const first = await product();
    const second = await product(1, 4000);
    await add(first.id, 2);
    await add(second.id);
    await db.product.update({ where: { id: first.id }, data: { price: 2000 } });
    const quote = await api('get', '/api/checkout');
    expect(quote.body.data).toMatchObject({
      deliveryFee: 2500,
      total: 10500,
      cart: { subtotal: 8000 },
    });
    const res = await api('post', '/api/orders').send({
      ...input,
      subtotal: 1,
      total: 1,
      deliveryFee: 0,
      buyerId: users[1],
      items: [{ productId: first.id, quantity: 999, unitPrice: 1 }],
    });
    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order).toMatchObject({
      address,
      subtotal: 8000,
      deliveryFee: 2500,
      total: 10500,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
    });
    expect(order.orderNumber).toMatch(/^MM-\d{8}-/);
    expect(order.sellerGroups).toHaveLength(2);
    expect(order.sellerGroups.map((group: { subtotal: number }) => group.subtotal).sort()).toEqual([
      4000, 4000,
    ]);
    expect((await db.product.findUniqueOrThrow({ where: { id: first.id } })).stock).toBe(3);
    expect((await db.product.findUniqueOrThrow({ where: { id: second.id } })).stock).toBe(4);
    expect((await api('get', '/api/cart')).body.data.items).toEqual([]);
    const history = await db.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      oldStatus: '',
      newStatus: 'CONFIRMED',
      changedBy: users[0],
    });
    await db.product.update({ where: { id: first.id }, data: { name: 'New name', price: 9000 } });
    const saved = await api('get', `/api/orders/${order.id}`);
    const items = saved.body.data.sellerGroups.flatMap(
      (group: { items: unknown[] }) => group.items,
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: first.id, productName: 'Tea', unitPrice: 2000 }),
      ]),
    );
    expect((await api('get', `/api/orders/${order.id}`, 1)).status).toBe(404);
    expect((await api('get', '/api/orders', 1)).body.data.total).toBe(0);
  });

  it('rolls back the whole checkout for insufficient stock without clearing the cart', async () => {
    const first = await product();
    const second = await product(1);
    await add(first.id, 2);
    await add(second.id, 2);
    await db.product.update({ where: { id: second.id }, data: { stock: 1 } });
    const before = await db.order.count({ where: { buyerId: users[0] } });
    expect((await api('post', '/api/orders').send(input)).status).toBe(409);
    expect(await db.order.count({ where: { buyerId: users[0] } })).toBe(before);
    expect((await db.product.findUniqueOrThrow({ where: { id: first.id } })).stock).toBe(5);
    expect((await db.product.findUniqueOrThrow({ where: { id: second.id } })).stock).toBe(1);
    expect((await api('get', '/api/cart')).body.data.items).toHaveLength(2);
  });

  it('rejects archived products and unapproved stores', async () => {
    const p = await product();
    await add(p.id);
    await db.product.update({ where: { id: p.id }, data: { status: 'ARCHIVED' } });
    expect((await api('post', '/api/orders').send(input)).status).toBe(409);
    await db.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
    await db.store.update({ where: { id: stores[0] }, data: { status: 'SUSPENDED' } });
    try {
      expect((await api('post', '/api/orders').send(input)).status).toBe(409);
    } finally {
      await db.store.update({ where: { id: stores[0] }, data: { status: 'APPROVED' } });
    }
  });

  it('prevents overselling between buyers competing for the last unit', async () => {
    const p = await product(0, 1500, 1);
    await add(p.id, 1, 0);
    await add(p.id, 1, 1);
    const results = await Promise.all([
      api('post', '/api/orders').send(input),
      api('post', '/api/orders', 1).send(input),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(0);
    const winner = results.findIndex((res) => res.status === 201);
    expect((await api('get', '/api/cart', winner)).body.data.items).toHaveLength(0);
    expect((await api('get', '/api/cart', 1 - winner)).body.data.items).toHaveLength(1);
  });

  it('serializes duplicate submits so only one order is created', async () => {
    const p = await product();
    await add(p.id);
    const before = await db.order.count({ where: { buyerId: users[0] } });
    const results = await Promise.all([
      api('post', '/api/orders').send(input),
      api('post', '/api/orders').send(input),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await db.order.count({ where: { buyerId: users[0] } })).toBe(before + 1);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(4);
  });

  it('supports prepaid methods without confirming payment and paginates only owned orders', async () => {
    for (const paymentMethod of ['KBZPAY', 'WAVEPAY', 'BANK_TRANSFER']) {
      const p = await product();
      await add(p.id);
      const res = await api('post', '/api/orders').send({ address, paymentMethod });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        paymentMethod,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
      });
    }
    const page = await api('get', '/api/orders?page=1&pageSize=1');
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.total).toBeGreaterThanOrEqual(3);
    expect(page.body.data.totalPages).toBe(page.body.data.total);
    expect((await api('get', '/api/orders', 2)).body.data.items).toEqual([]);
  });

  it('rejects MMK overflow before changing stock or creating an order', async () => {
    const p = await product(0, 2147483647, 2);
    await add(p.id, 2);
    expect((await api('post', '/api/orders').send(input)).status).toBe(422);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(2);
    expect((await api('get', '/api/cart')).body.data.items).toHaveLength(1);
  });
});
