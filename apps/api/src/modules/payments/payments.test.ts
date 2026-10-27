import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
const saved = {
  upload: env.UPLOAD_DIR,
  kbz: env.PAYMENT_INSTRUCTIONS_KBZPAY,
  wave: env.PAYMENT_INSTRUCTIONS_WAVEPAY,
  bank: env.PAYMENT_INSTRUCTIONS_BANK_TRANSFER,
};
let directory: string;
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1cAAAAASUVORK5CYII=',
  'base64',
);

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'myanmart-payments-'));
  env.UPLOAD_DIR = directory;
  env.PAYMENT_INSTRUCTIONS_KBZPAY = 'KBZ test receiving account';
  env.PAYMENT_INSTRUCTIONS_WAVEPAY = 'Wave test receiving account';
  env.PAYMENT_INSTRUCTIONS_BANK_TRANSFER = 'Bank test receiving account';
  for (const role of ['BUYER', 'BUYER', 'SELLER', 'SELLER', 'ADMIN'] as const) {
    const user = await db.user.create({
      data: {
        name: 'Payment test',
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
            data: {
              name: 'Payment store',
              slug: randomUUID(),
              ownerId: user.id,
              status: 'APPROVED',
            },
          })
        ).id,
      );
  }
});
afterAll(async () => {
  await db.order.deleteMany({ where: { buyerId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  env.UPLOAD_DIR = saved.upload;
  env.PAYMENT_INSTRUCTIONS_KBZPAY = saved.kbz;
  env.PAYMENT_INSTRUCTIONS_WAVEPAY = saved.wave;
  env.PAYMENT_INSTRUCTIONS_BANK_TRANSFER = saved.bank;
  await rm(directory, { recursive: true, force: true });
  await db.$disconnect();
});
function api(method: 'get' | 'post', url: string, user = 0) {
  return request(app)[method](url).set('Authorization', `Bearer ${tokens[user]}`);
}
async function order(
  method: 'COD' | 'KBZPAY' | 'WAVEPAY' | 'BANK_TRANSFER' = 'KBZPAY',
  mixed = false,
) {
  const status = method === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT';
  return db.order.create({
    data: {
      buyerId: users[0]!,
      orderNumber: randomUUID(),
      addressSnapshot: {},
      subtotal: 1000,
      deliveryFee: 100,
      total: 1100,
      paymentMethod: method,
      status,
      items: {
        create: (mixed ? stores : [stores[0]!]).map((storeId) => ({
          storeId,
          productName: 'Snapshot',
          unitPrice: 1000,
          quantity: 1,
          subtotal: 1000,
        })),
      },
      statusHistory: { create: { oldStatus: '', newStatus: status, changedBy: users[0] } },
    },
  });
}
function submit(id: string, user = 0, content = image, type = 'image/png') {
  return api('post', `/api/orders/${id}/payments`, user)
    .field('transactionReference', 'TRANSFER-123')
    .attach('receipt', content, { filename: 'receipt.png', contentType: type });
}
function review(id: string, paymentId: string, decision = 'VERIFIED', user = 4) {
  return api(
    'post',
    `/api/${user === 4 ? 'admin' : 'seller'}/payment-orders/${id}/payments/${paymentId}/review`,
    user,
  ).send({ decision });
}
function transition(id: string, status: string, extra = {}, user = 4) {
  return api(
    'post',
    `/api/${user === 4 ? 'admin' : 'seller'}/payment-orders/${id}/status`,
    user,
  ).send({ status, ...extra });
}
async function history(id: string) {
  return db.orderStatusHistory.count({ where: { orderId: id } });
}

describe('manual payments and order state machine', () => {
  it('supports all prepaid methods with server amounts and private receipts', async () => {
    for (const method of ['KBZPAY', 'WAVEPAY', 'BANK_TRANSFER'] as const) {
      const o = await order(method);
      const before = await api('get', `/api/orders/${o.id}/payments`);
      expect(before.body.data.instructions).toContain('test receiving account');
      expect(before.body.data.canSubmit).toBe(true);
      const result = await submit(o.id);
      expect(result.status).toBe(201);
      expect(result.body.data).toMatchObject({
        status: 'PAYMENT_SUBMITTED',
        paymentStatus: 'SUBMITTED',
        canSubmit: false,
      });
      const p = result.body.data.attempts[0];
      expect(p).toMatchObject({
        amount: 1100,
        method,
        transactionReference: 'TRANSFER-123',
        verifiedBy: null,
      });
      expect((await api('get', p.receiptUrl)).status).toBe(200);
      expect((await api('get', p.receiptUrl, 1)).status).toBe(404);
      expect((await api('get', p.receiptUrl, 3)).status).toBe(404);
      expect((await api('get', p.receiptUrl, 2)).status).toBe(200);
      expect((await api('get', p.receiptUrl, 4)).status).toBe(200);
      expect((await request(app).get(p.receiptUrl)).status).toBe(401);
      expect(await history(o.id)).toBe(2);
      expect((await submit(o.id)).status).toBe(409);
      expect((await api('post', `/api/orders/${o.id}/cancel`).send({})).status).toBe(409);
    }
  });

  it('rejects missing, spoofed, disallowed and oversized receipts without attempts or history', async () => {
    const o = await order();
    expect((await submit(o.id, 0, Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(400);
    expect((await submit(o.id, 0, Buffer.from('not a PNG'))).status).toBe(400);
    expect(
      (await submit(o.id, 0, Buffer.alloc(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1))).status,
    ).toBe(400);
    expect(
      (await api('post', `/api/orders/${o.id}/payments`).field('transactionReference', 'ref'))
        .status,
    ).toBe(400);
    expect(
      (
        await api('post', `/api/orders/${o.id}/payments`)
          .field('transactionReference', ' ')
          .attach('receipt', image, 'r.png')
      ).status,
    ).toBe(422);
    expect(
      (
        await api('post', `/api/orders/${o.id}/payments`)
          .field('transactionReference', 'ref')
          .field('pin', 'secret')
          .attach('receipt', image, 'r.png')
      ).status,
    ).toBe(400);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(0);
    expect(await history(o.id)).toBe(1);
  });

  it('enforces ownership, configuration, COD and cancelled eligibility', async () => {
    const o = await order();
    expect((await submit(o.id, 1)).status).toBe(404);
    expect((await api('get', `/api/orders/${o.id}/payments`, 1)).status).toBe(404);
    expect((await request(app).post(`/api/orders/${o.id}/payments`)).status).toBe(401);
    env.PAYMENT_INSTRUCTIONS_KBZPAY = '';
    try {
      expect((await submit(o.id)).status).toBe(409);
    } finally {
      env.PAYMENT_INSTRUCTIONS_KBZPAY = 'KBZ test receiving account';
    }
    expect((await submit((await order('COD')).id)).status).toBe(409);
    // Null product snapshots can still be cancelled.
    expect((await api('post', `/api/orders/${o.id}/cancel`).send({})).status).toBe(200);
    expect((await submit(o.id)).status).toBe(409);
  });

  it('serializes duplicate submissions and cleans up failed uploads', async () => {
    const o = await order();
    const before = (await readdir(path.join(directory, 'receipts'))).length;
    const results = await Promise.all([submit(o.id), submit(o.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(1);
    expect(await history(o.id)).toBe(2);
    expect((await readdir(path.join(directory, 'receipts'))).length).toBe(before + 1);
  });

  it('rejects then accepts a new attempt; records the reviewer and one history per transition', async () => {
    const o = await order();
    const first = (await submit(o.id)).body.data.attempts[0];
    expect((await review(o.id, first.id, 'REJECTED', 2)).status).toBe(200);
    expect(await history(o.id)).toBe(3);
    const second = (await submit(o.id)).body.data.attempts.find(
      (p: { status: string }) => p.status === 'SUBMITTED',
    );
    expect((await review(o.id, first.id)).status).toBe(409);
    const results = await Promise.all([review(o.id, second.id), review(o.id, second.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const verified = await db.payment.findUniqueOrThrow({ where: { id: second.id } });
    expect(verified.verifiedBy).toBe(users[4]);
    expect(await history(o.id)).toBe(5);
    const rejected = await db.payment.findUniqueOrThrow({ where: { id: first.id } });
    expect(rejected).toMatchObject({ status: 'REJECTED', verifiedBy: users[2] });
    const rows = await db.orderStatusHistory.findMany({ where: { orderId: o.id } });
    expect(
      rows.filter((r) => r.oldStatus === 'PAYMENT_SUBMITTED' && r.newStatus === 'CONFIRMED'),
    ).toHaveLength(1);
  });

  it('restricts review to authorized roles and wholly owned approved stores', async () => {
    const o = await order();
    const p = (await submit(o.id)).body.data.attempts[0];
    expect((await api('get', '/api/admin/payment-orders', 0)).status).toBe(403);
    expect((await api('get', '/api/admin/payment-orders', 2)).status).toBe(403);
    expect((await api('get', '/api/seller/payment-orders', 0)).status).toBe(403);
    expect((await review(o.id, p.id, 'VERIFIED', 3)).status).toBe(404);
    const mixed = await order('KBZPAY', true);
    const mp = (await submit(mixed.id)).body.data.attempts[0];
    expect((await review(mixed.id, mp.id, 'VERIFIED', 2)).status).toBe(404);
    expect((await api('get', mp.receiptUrl, 2)).status).toBe(404);
    expect((await review(mixed.id, mp.id)).status).toBe(200);
    await db.store.update({ where: { id: stores[0] }, data: { status: 'SUSPENDED' } });
    try {
      expect((await review(o.id, p.id, 'VERIFIED', 2)).status).toBe(404);
    } finally {
      await db.store.update({ where: { id: stores[0] }, data: { status: 'APPROVED' } });
    }
    expect((await review(o.id, p.id, 'VERIFIED', 2)).status).toBe(200);
    expect(
      (await api('get', '/api/seller/payment-orders?page=1&pageSize=1', 2)).body.data.items,
    ).toHaveLength(1);
  });

  it('rejects invalid transitions and prepaid processing without a verified record', async () => {
    const o = await order();
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED', 'REFUNDED'])
      expect((await transition(o.id, status, { transactionReference: 'refund' })).status).toBe(409);
    expect((await transition(o.id, 'CONFIRMED')).status).toBe(422);
    await db.order.update({
      where: { id: o.id },
      data: { status: 'CONFIRMED', paymentStatus: 'VERIFIED' },
    });
    expect((await transition(o.id, 'PROCESSING')).status).toBe(409);
    expect(await history(o.id)).toBe(1);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('advances verified prepaid orders and records a full manual refund atomically', async () => {
    const o = await order();
    const p = (await submit(o.id)).body.data.attempts[0];
    await review(o.id, p.id);
    let count = 3;
    expect((await transition(o.id, 'SHIPPED')).status).toBe(409);
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      expect((await transition(o.id, status)).status).toBe(200);
      expect(await history(o.id)).toBe(++count);
      expect((await transition(o.id, status)).status).toBe(409);
      expect(await history(o.id)).toBe(count);
    }
    expect((await transition(o.id, 'REFUNDED')).status).toBe(422);
    const results = await Promise.all([
      transition(o.id, 'REFUNDED', { transactionReference: 'REFUND-1' }),
      transition(o.id, 'REFUNDED', { transactionReference: 'REFUND-1' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await history(o.id)).toBe(count + 1);
    expect(
      await db.payment.findMany({ where: { orderId: o.id, status: 'REFUNDED' } }),
    ).toMatchObject([{ amount: 1100, transactionReference: 'REFUND-1', verifiedBy: users[4] }]);
    expect((await transition(o.id, 'PROCESSING')).status).toBe(409);
  });

  it('records COD collection only on delivery and supports a manual refund', async () => {
    const o = await order('COD');
    expect((await transition(o.id, 'REFUNDED', { transactionReference: 'refund' })).status).toBe(
      409,
    );
    expect((await transition(o.id, 'PROCESSING', {}, 2)).status).toBe(200);
    expect((await transition(o.id, 'SHIPPED', {}, 2)).status).toBe(200);
    expect((await transition(o.id, 'DELIVERED', {}, 2)).status).toBe(200);
    expect((await transition(o.id, 'DELIVERED', {}, 2)).status).toBe(409);
    expect(await db.payment.findMany({ where: { orderId: o.id } })).toMatchObject([
      { status: 'VERIFIED', method: 'COD', amount: 1100, verifiedBy: users[2] },
    ]);
    expect(await history(o.id)).toBe(4);
    expect(
      (await transition(o.id, 'REFUNDED', { transactionReference: 'CASH-REFUND' }, 2)).status,
    ).toBe(200);
    expect(await history(o.id)).toBe(5);
  });

  it('serializes payment submission against buyer cancellation', async () => {
    const o = await order();
    const results = await Promise.all([
      submit(o.id),
      api('post', `/api/orders/${o.id}/cancel`).send({}),
    ]);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await history(o.id)).toBe(2);
    const stored = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { payments: true },
    });
    expect(stored.payments).toHaveLength(stored.status === 'CANCELLED' ? 0 : 1);
  });
});
