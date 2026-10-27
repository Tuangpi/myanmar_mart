import type { Prisma } from '@prisma/client';
import type {
  AuthUser,
  FulfillmentEvent,
  OrderPaymentsResponse,
  PaymentReviewOrder,
} from '@myanmart/shared';
import { ORDER_TRANSITIONS } from '@myanmart/shared';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { receiptStorage } from '../../lib/product-image-storage.js';
import { changeOrderStatus } from '../orders/order-state.js';

const include = {
  items: { include: { store: true } },
  payments: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};
type PaymentOrder = Prisma.OrderGetPayload<{ include: typeof include }>;

function reviewerWhere(user: AuthUser): Prisma.OrderWhereInput {
  if (user.role === 'ADMIN') return {};
  if (user.role !== 'SELLER') throw AppError.forbidden();
  const owned = { store: { ownerId: user.id, status: 'APPROVED' as const } };
  // A whole-order payment cannot be verified by one participant in a mixed-seller order.
  return { items: { some: owned, every: owned } };
}

function canSubmit(order: PaymentOrder) {
  return (
    order.paymentMethod !== 'COD' &&
    order.status === 'PENDING_PAYMENT' &&
    ['PENDING', 'REJECTED'].includes(order.paymentStatus) &&
    !order.payments.some((p) => ['SUBMITTED', 'VERIFIED', 'REFUNDED'].includes(p.status))
  );
}

function serialize(order: PaymentOrder): OrderPaymentsResponse {
  // Mixed-seller orders always use marketplace receiving instructions.
  const stores = new Map(order.items.map((item) => [item.storeId, item.store]));
  const store = stores.size === 1 ? [...stores.values()][0] : undefined;
  const instructions = store?.paymentInstructions as Record<string, string> | undefined;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    method: order.paymentMethod,
    status: order.status,
    paymentStatus: order.paymentStatus,
    instructions:
      order.paymentMethod === 'COD'
        ? ''
        : instructions?.[order.paymentMethod]?.trim() ||
          env[`PAYMENT_INSTRUCTIONS_${order.paymentMethod}`],
    canSubmit: canSubmit(order),
    attempts: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      status: p.status,
      transactionReference: p.transactionReference,
      receiptUrl: p.receiptUrl
        ? `${env.API_PREFIX}/orders/${order.id}/payments/${p.id}/receipt`
        : null,
      verifiedBy: p.verifiedBy,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

export async function readPayments(user: AuthUser, id: string) {
  const order = await getPrisma().order.findFirst({
    where: { id, buyerId: user.id },
    include,
  });
  if (!order) throw AppError.notFound('Order not found');
  return serialize(order);
}

export async function submitPayment(
  user: AuthUser,
  id: string,
  reference: string,
  file: Express.Multer.File,
) {
  const key = await receiptStorage.save(file.buffer, file.mimetype);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE id = ${id} AND buyer_id = ${user.id} FOR UPDATE`;
      if (!locked.length) throw AppError.notFound('Order not found');
      const order = await tx.order.findUniqueOrThrow({ where: { id }, include });
      if (!canSubmit(order)) throw AppError.conflict('Order cannot accept a payment attempt');
      if (!serialize(order).instructions.trim())
        throw AppError.conflict('Payment instructions are not configured');
      await tx.payment.create({
        data: {
          orderId: id,
          method: order.paymentMethod,
          amount: order.total,
          transactionReference: reference,
          receiptUrl: key,
          status: 'SUBMITTED',
        },
      });
      await tx.order.update({ where: { id }, data: { paymentStatus: 'SUBMITTED' } });
      await changeOrderStatus(tx, order, 'PAYMENT_SUBMITTED', user.id);
      return serialize(await tx.order.findUniqueOrThrow({ where: { id }, include }));
    });
  } catch (error) {
    await receiptStorage.remove(key);
    throw error;
  }
}

export async function receiptPath(user: AuthUser, id: string, paymentId: string) {
  const order = await getPrisma().order.findFirst({
    where: {
      id,
      ...(user.role === 'ADMIN'
        ? {}
        : {
            OR: [{ buyerId: user.id }, ...(user.role === 'SELLER' ? [reviewerWhere(user)] : [])],
          }),
    },
    include,
  });
  const payment = order?.payments.find((p) => p.id === paymentId);
  if (!payment?.receiptUrl) throw AppError.notFound('Receipt not found');
  return receiptStorage.path(payment.receiptUrl);
}

export async function listReviewOrders(user: AuthUser, page: number, pageSize: number) {
  const where = reviewerWhere(user);
  const [orders, total] = await getPrisma().$transaction([
    getPrisma().order.findMany({
      where,
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getPrisma().order.count({ where }),
  ]);
  return {
    items: orders.map((o): PaymentReviewOrder => ({
      ...serialize(o),
      allowedStatuses: ORDER_TRANSITIONS[o.status].filter(
        (s) =>
          ['PROCESSING', 'SHIPPED', 'DELIVERED', 'REFUNDED'].includes(s) &&
          (s === 'REFUNDED'
            ? o.paymentStatus === 'VERIFIED' && o.payments.some((p) => p.status === 'VERIFIED')
            : o.paymentMethod === 'COD' ||
              (o.paymentStatus === 'VERIFIED' && o.payments.some((p) => p.status === 'VERIFIED'))),
      ),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

async function lockedReviewOrder(tx: Prisma.TransactionClient, user: AuthUser, id: string) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id, ...reviewerWhere(user) }, include });
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

export async function reviewPayment(
  user: AuthUser,
  id: string,
  paymentId: string,
  decision: 'VERIFIED' | 'REJECTED',
) {
  return getPrisma().$transaction(async (tx) => {
    const order = await lockedReviewOrder(tx, user, id);
    const payment = order.payments.find((p) => p.id === paymentId);
    if (
      order.status !== 'PAYMENT_SUBMITTED' ||
      order.paymentStatus !== 'SUBMITTED' ||
      payment?.status !== 'SUBMITTED'
    )
      throw AppError.conflict('Payment is not awaiting review');
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: decision, verifiedBy: user.id },
    });
    await tx.order.update({ where: { id }, data: { paymentStatus: decision } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'payment.reviewed',
        entityType: 'payment',
        entityId: paymentId,
        metadata: { decision, orderId: id },
      },
    });
    await changeOrderStatus(
      tx,
      order,
      decision === 'VERIFIED' ? 'CONFIRMED' : 'PENDING_PAYMENT',
      user.id,
    );
    return serialize(await tx.order.findUniqueOrThrow({ where: { id }, include }));
  });
}

export async function transitionOrder(
  user: AuthUser,
  id: string,
  status: 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'REFUNDED',
  reference?: string,
) {
  return getPrisma().$transaction(async (tx) => {
    const order = await lockedReviewOrder(tx, user, id);
    if (status === 'REFUNDED') {
      if (
        order.paymentStatus !== 'VERIFIED' ||
        !reference ||
        !order.payments.some((p) => p.status === 'VERIFIED')
      )
        throw AppError.conflict('Only collected payments can be refunded with a reference');
      await tx.payment.create({
        data: {
          orderId: id,
          method: order.paymentMethod,
          amount: order.total,
          status: 'REFUNDED',
          transactionReference: reference,
          verifiedBy: user.id,
        },
      });
      await tx.order.update({ where: { id }, data: { paymentStatus: 'REFUNDED' } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'payment.refunded',
          entityType: 'order',
          entityId: id,
          metadata: { reference },
        },
      });
    } else if (
      order.paymentMethod !== 'COD' &&
      (order.paymentStatus !== 'VERIFIED' || !order.payments.some((p) => p.status === 'VERIFIED'))
    ) {
      throw AppError.conflict('Prepaid orders require a verified payment');
    }
    // Delivery of COD records collection; this is a manual acknowledgement by the actor.
    if (status === 'DELIVERED' && order.paymentMethod === 'COD') {
      await tx.payment.create({
        data: {
          orderId: id,
          method: 'COD',
          amount: order.total,
          status: 'VERIFIED',
          verifiedBy: user.id,
        },
      });
      await tx.order.update({ where: { id }, data: { paymentStatus: 'VERIFIED' } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'payment.collected',
          entityType: 'order',
          entityId: id,
          metadata: { method: 'COD' },
        },
      });
    }
    await changeOrderStatus(tx, order, status, user.id);
    if (status !== 'REFUNDED') {
      const steps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
      for (const item of order.items) {
        // Legacy whole-order transitions must not regress items already fulfilled by a seller.
        if (steps.indexOf(item.fulfillmentStatus) >= steps.indexOf(status)) continue;
        const history = item.fulfillmentHistory as unknown as FulfillmentEvent[];
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            fulfillmentStatus: status,
            fulfillmentHistory: [
              ...history.map((event) => ({ ...event })),
              { status, createdAt: new Date().toISOString() },
            ],
          },
        });
      }
    }
    return serialize(await tx.order.findUniqueOrThrow({ where: { id }, include }));
  });
}
