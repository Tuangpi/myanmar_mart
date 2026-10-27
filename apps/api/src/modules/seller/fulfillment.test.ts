import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
beforeAll(async () => {
  for (const role of ['BUYER', 'SELLER', 'SELLER', 'SELLER', 'ADMIN'] as const) {
    const user = await db.user.create({
      data: {
        name: 'Fulfillment test',
        email: `${randomUUID()}@test.local`,
        passwordHash: 'unused',
        role,
      },
    });
    users.push(user.id);
    tokens.push(signToken({ ...user, storeId: null }));
    if (role === 'SELLER')
      stores.push(
        (
          await db.store.create({
            data: { ownerId: user.id, name: 'Store', slug: randomUUID(), status: 'APPROVED' },
          })
        ).id,
      );
  }
});
afterAll(async () => {
  await db.order.deleteMany({ where: { buyerId: users[0] } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
function api(method: 'get' | 'patch' | 'post', path: string, user = 1) {
  return request(app)[method](path).set('Authorization', `Bearer ${tokens[user]}`);
}
async function order(mixed = true, prepaid = false) {
  return db.order.create({
    data: {
      buyerId: users[0]!,
      orderNumber: randomUUID(),
      addressSnapshot: { recipientName: 'Buyer' },
      subtotal: mixed ? 3000 : 1000,
      deliveryFee: 100,
      total: mixed ? 3100 : 1100,
      paymentMethod: prepaid ? 'KBZPAY' : 'COD',
      status: 'CONFIRMED',
      items: {
        create: (mixed ? stores.slice(0, 2) : stores.slice(0, 1)).map((storeId, i) => ({
          storeId,
          productName: i ? 'Other private item' : 'Own snapshot',
          unitPrice: (i + 1) * 1000,
          quantity: 1,
          subtotal: (i + 1) * 1000,
        })),
      },
      statusHistory: { create: { oldStatus: '', newStatus: 'CONFIRMED', changedBy: users[0] } },
    },
    include: { items: { orderBy: { subtotal: 'asc' } } },
  });
}
function advance(id: string, itemId: string, status: string, user = 1) {
  return api('patch', `/api/seller/orders/${id}/status`, user).send({ itemId, status });
}
describe('seller fulfillment', () => {
  it('scopes listing, totals and mutation to owned snapshots', async () => {
    const o = await order();
    const list = await api('get', '/api/seller/orders?pageSize=1');
    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({ id: o.id, subtotal: 1000 });
    expect(list.body.data.items[0].items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('Other private item');
    expect((await api('get', '/api/seller/orders', 3)).body.data.items).toHaveLength(0);
    expect((await advance(o.id, o.items[1]!.id, 'PROCESSING')).status).toBe(404);
    expect((await advance(o.id, o.items[0]!.id, 'SHIPPED')).status).toBe(409);
    expect((await advance(o.id, o.items[0]!.id, 'PROCESSING', 3)).status).toBe(404);
    expect((await api('get', '/api/seller/orders?page=0')).status).toBe(422);
  });
  it('serializes concurrent item updates, aggregates status and records COD once', async () => {
    const o = await order();
    const id = o.items[0]!.id;
    const results = await Promise.all([
      advance(o.id, id, 'PROCESSING'),
      advance(o.id, id, 'PROCESSING'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CONFIRMED');
    expect((await api('post', `/api/orders/${o.id}/cancel`, 0).send({})).status).toBe(409);
    for (const status of ['SHIPPED', 'DELIVERED'])
      expect((await advance(o.id, id, status)).status).toBe(200);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(0);
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED'])
      expect((await advance(o.id, o.items[1]!.id, status, 2)).status).toBe(200);
    const stored = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { statusHistory: true, payments: true },
    });
    expect(stored).toMatchObject({ status: 'DELIVERED', paymentStatus: 'VERIFIED' });
    expect(stored.statusHistory).toHaveLength(4);
    expect(stored.payments).toHaveLength(1);
    expect((await advance(o.id, id, 'DELIVERED')).status).toBe(409);
    const buyer = await api('get', `/api/orders/${o.id}`, 0);
    expect(buyer.body.data.canCancel).toBe(false);
    expect(buyer.body.data.statusHistory).toHaveLength(4);
    expect(buyer.body.data.sellerGroups[0].items[0].fulfillmentHistory).toHaveLength(3);
    const summary = await api('get', '/api/seller/sales-summary');
    expect(summary.body.data.deliveredSubtotal).toBe(1000);
  });
  it('requires a verified prepaid record and blocks suspended and terminal orders', async () => {
    const o = await order(false, true);
    expect((await advance(o.id, o.items[0]!.id, 'PROCESSING')).status).toBe(409);
    await db.order.update({
      where: { id: o.id },
      data: {
        paymentStatus: 'VERIFIED',
        payments: { create: { method: 'KBZPAY', amount: o.total, status: 'VERIFIED' } },
      },
    });
    await db.store.update({ where: { id: stores[0] }, data: { status: 'SUSPENDED' } });
    expect((await advance(o.id, o.items[0]!.id, 'PROCESSING')).status).toBe(403);
    await db.store.update({ where: { id: stores[0] }, data: { status: 'APPROVED' } });
    expect((await advance(o.id, o.items[0]!.id, 'PROCESSING')).status).toBe(200);
    await db.order.update({ where: { id: o.id }, data: { status: 'REFUNDED' } });
    expect((await advance(o.id, o.items[0]!.id, 'SHIPPED')).status).toBe(409);
  });
  it('keeps legacy whole-order transitions in sync without regressing advanced items', async () => {
    const o = await order();
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED'])
      expect((await advance(o.id, o.items[0]!.id, status)).status).toBe(200);
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      expect(
        (await api('post', `/api/admin/payment-orders/${o.id}/status`, 4).send({ status })).status,
      ).toBe(200);
      const advanced = await db.orderItem.findUniqueOrThrow({ where: { id: o.items[0]!.id } });
      expect(advanced.fulfillmentStatus).toBe('DELIVERED');
    }
    expect(await db.payment.count({ where: { orderId: o.id, status: 'VERIFIED' } })).toBe(1);
    expect(
      (await db.orderItem.findUniqueOrThrow({ where: { id: o.items[1]!.id } })).fulfillmentStatus,
    ).toBe('DELIVERED');
  });
  it('enforces roles for all seller endpoints and rejects malformed writes', async () => {
    for (const path of [
      '/api/seller/orders',
      '/api/seller/sales-summary',
      '/api/seller/payment-instructions',
    ]) {
      expect((await request(app).get(path)).status).toBe(401);
      for (const role of [0, 4]) expect((await api('get', path, role)).status).toBe(403);
    }
    expect((await api('patch', '/api/seller/orders/invalid/status').send({})).status).toBe(422);
    expect(
      (await api('patch', '/api/seller/payment-instructions').send({ KBZPAY: 'x', pin: 'no' }))
        .status,
    ).toBe(422);
  });
  it('persists only own instructions and uses marketplace instructions for mixed orders', async () => {
    const instructions = { KBZPAY: 'Seller receiving account', WAVEPAY: '', BANK_TRANSFER: '' };
    expect(
      (await api('patch', '/api/seller/payment-instructions').send(instructions)).body.data,
    ).toEqual(instructions);
    expect((await api('get', '/api/seller/payment-instructions')).body.data).toEqual(instructions);
    expect((await api('get', '/api/seller/payment-instructions', 2)).body.data.KBZPAY).toBe('');
    const single = await order(false, true);
    expect((await api('get', `/api/orders/${single.id}/payments`, 0)).body.data.instructions).toBe(
      instructions.KBZPAY,
    );
    const mixed = await order(true, true);
    expect((await api('get', `/api/orders/${mixed.id}/payments`, 0)).body.data.instructions).toBe(
      env.PAYMENT_INSTRUCTIONS_KBZPAY,
    );
  });
});
