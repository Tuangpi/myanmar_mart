import type { Prisma } from '@prisma/client';
import type { DeliveryAddress, FulfillmentEvent, SellerOrderResponse } from '@myanmart/shared';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { changeOrderStatus } from '../orders/order-state.js';

const steps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const include = { items: { include: { store: true } }, payments: true };
type StoredOrder = Prisma.OrderGetPayload<{ include: typeof include }>;

function paid(order: StoredOrder) {
  return (
    order.paymentMethod === 'COD' ||
    (order.paymentStatus === 'VERIFIED' && order.payments.some((p) => p.status === 'VERIFIED'))
  );
}

function serialize(order: StoredOrder, userId: string): SellerOrderResponse {
  const items = order.items.filter((i) => i.store.ownerId === userId);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    address: order.addressSnapshot as unknown as DeliveryAddress,
    createdAt: order.createdAt.toISOString(),
    subtotal: items.reduce((sum, i) => sum + i.subtotal, 0),
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal,
      fulfillmentStatus: i.fulfillmentStatus,
      fulfillmentHistory: i.fulfillmentHistory as unknown as FulfillmentEvent[],
      allowedStatuses:
        i.store.status === 'APPROVED' &&
        paid(order) &&
        steps.includes(order.status) &&
        steps.indexOf(i.fulfillmentStatus) >= 0 &&
        steps.indexOf(i.fulfillmentStatus) < 3
          ? [steps[steps.indexOf(i.fulfillmentStatus) + 1]!]
          : [],
    })),
  };
}

export async function listSellerOrders(userId: string, page: number, pageSize: number) {
  const db = getPrisma();
  const where = { items: { some: { store: { ownerId: userId } } } };
  const [orders, total] = await db.$transaction([
    db.order.findMany({
      where,
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);
  return {
    items: orders.map((o) => serialize(o, userId)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function fulfillItem(userId: string, id: string, itemId: string, status: string) {
  return getPrisma().$transaction(async (tx) => {
    // All payment, cancellation and fulfillment writers serialize on this row.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findFirst({
      where: { id, items: { some: { id: itemId, store: { ownerId: userId } } } },
      include,
    });
    if (!order) throw AppError.notFound('Order item not found');
    const item = order.items.find((i) => i.id === itemId)!;
    // Lock and recheck approval against concurrent moderation.
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${item.storeId} FOR UPDATE`;
    const store = await tx.store.findUniqueOrThrow({ where: { id: item.storeId } });
    if (store.status !== 'APPROVED') throw AppError.forbidden('Store must be approved');
    const allowed = serialize(order, userId).items.find((i) => i.id === itemId)!.allowedStatuses;
    if (!allowed.includes(status)) throw AppError.conflict('Invalid fulfillment transition');
    const history = item.fulfillmentHistory as unknown as FulfillmentEvent[];
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        fulfillmentStatus: status,
        fulfillmentHistory: [
          ...history.map((event) => ({ ...event })),
          { status, createdAt: new Date().toISOString() },
        ],
      },
    });
    item.fulfillmentStatus = status;
    const minimum = Math.min(...order.items.map((i) => steps.indexOf(i.fulfillmentStatus)));
    const target = steps[minimum];
    if (target && target !== order.status) {
      await changeOrderStatus(tx, order, target as 'PROCESSING' | 'SHIPPED' | 'DELIVERED', userId);
      if (target === 'DELIVERED' && order.paymentMethod === 'COD') {
        await tx.payment.create({
          data: {
            orderId: id,
            method: 'COD',
            amount: order.total,
            status: 'VERIFIED',
            verifiedBy: userId,
          },
        });
        await tx.order.update({ where: { id }, data: { paymentStatus: 'VERIFIED' } });
      }
    }
    return serialize(await tx.order.findUniqueOrThrow({ where: { id }, include }), userId);
  });
}

export async function sellerSummary(userId: string) {
  const db = getPrisma();
  const owned = { store: { ownerId: userId } };
  const [orderCount, delivered, active] = await db.$transaction([
    db.order.count({ where: { items: { some: owned } } }),
    db.orderItem.aggregate({
      where: {
        ...owned,
        fulfillmentStatus: 'DELIVERED',
        order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
      _sum: { subtotal: true },
    }),
    db.orderItem.aggregate({
      where: {
        ...owned,
        fulfillmentStatus: { not: 'DELIVERED' },
        order: { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } },
      },
      _sum: { subtotal: true },
    }),
  ]);
  return {
    orderCount,
    deliveredSubtotal: delivered._sum.subtotal ?? 0,
    activeSubtotal: active._sum.subtotal ?? 0,
  };
}

export async function sellerInstructions(userId: string, instructions?: Prisma.InputJsonObject) {
  return getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM stores WHERE owner_id = ${userId} ORDER BY created_at, id LIMIT 1 FOR UPDATE`;
    if (!rows[0]) throw AppError.forbidden('Seller store not found');
    const store = instructions
      ? await tx.store.update({
          where: { id: rows[0].id },
          data: { paymentInstructions: instructions },
        })
      : await tx.store.findUniqueOrThrow({ where: { id: rows[0].id } });
    const saved = store.paymentInstructions as Record<string, string>;
    return {
      KBZPAY: saved.KBZPAY ?? '',
      WAVEPAY: saved.WAVEPAY ?? '',
      BANK_TRANSFER: saved.BANK_TRANSFER ?? '',
    };
  });
}
