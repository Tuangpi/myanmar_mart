import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CheckoutInput,
  CheckoutQuote,
  DeliveryAddress,
  OrderResponse,
} from '@myanmart/shared';
import { env } from '../../config/env.js';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { cartAction } from '../cart/cart.service.js';
import { changeOrderStatus } from './order-state.js';

const orderInclude = {
  payments: { select: { status: true } },
  items: {
    include: { store: true },
    orderBy: [{ storeId: 'asc' as const }, { id: 'asc' as const }],
  },
};
type StoredOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function canBuyerCancel(order: StoredOrder): boolean {
  const eligibleStatus =
    order.paymentMethod === 'COD'
      ? order.status === 'CONFIRMED'
      : order.status === 'PENDING_PAYMENT';
  return (
    eligibleStatus &&
    ['PENDING', 'REJECTED'].includes(order.paymentStatus) &&
    !order.payments.some((payment) =>
      ['SUBMITTED', 'VERIFIED', 'REFUNDED'].includes(payment.status),
    )
  );
}

function serialize(order: StoredOrder): OrderResponse {
  const groups = new Map<string, OrderResponse['sellerGroups'][number]>();
  for (const item of order.items) {
    let group = groups.get(item.storeId);
    if (!group) {
      group = {
        storeId: item.storeId,
        storeName: item.store.name,
        storeSlug: item.store.slug,
        subtotal: 0,
        items: [],
      };
      groups.set(item.storeId, group);
    }
    group.subtotal += item.subtotal;
    group.items.push({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    });
  }
  return {
    canCancel: canBuyerCancel(order),
    id: order.id,
    orderNumber: order.orderNumber,
    address: order.addressSnapshot as unknown as DeliveryAddress,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    sellerGroups: [...groups.values()],
  };
}

function checkedTotal(subtotal: number): number {
  const total = subtotal + env.DELIVERY_FEE_MMK;
  if (!Number.isSafeInteger(total) || total > 2147483647 || subtotal < 0) {
    throw AppError.unprocessable('Order total exceeds the supported MMK limit');
  }
  return total;
}

export async function checkoutQuote(userId: string): Promise<CheckoutQuote> {
  const cart = await cartAction(userId, { kind: 'read' });
  return { cart, deliveryFee: env.DELIVERY_FEE_MMK, total: checkedTotal(cart.subtotal) };
}

export async function createOrder(userId: string, input: CheckoutInput): Promise<OrderResponse> {
  return getPrisma().$transaction(async (tx) => {
    // Same lock as cart mutations: duplicate submits cannot consume the same cart twice.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const rows = await tx.cartItem.findMany({
      where: { cart: { userId } },
      include: { product: { select: { storeId: true } } },
    });
    if (!rows.length) throw AppError.conflict('Cart is empty');

    // Store before product matches seller writes. Stable ordering prevents checkout deadlocks.
    const storeIds = [...new Set(rows.map((row) => row.product.storeId))].sort();
    const productIds = [...new Set(rows.map((row) => row.productId))].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM stores WHERE id IN (${Prisma.join(storeIds)}) ORDER BY id FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`,
    );
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: { store: true },
    });
    const quantities = new Map<string, number>();
    for (const row of rows)
      quantities.set(row.productId, (quantities.get(row.productId) ?? 0) + row.quantity);

    let subtotal = 0;
    const items = products.map((product) => {
      const quantity = quantities.get(product.id)!;
      if (
        product.status !== 'ACTIVE' ||
        product.store.status !== 'APPROVED' ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > product.stock
      ) {
        throw AppError.conflict('Cart contains unavailable or insufficient stock', {
          productId: product.id,
          stock: product.stock,
        });
      }
      const lineSubtotal = product.price * quantity;
      subtotal += lineSubtotal;
      return {
        storeId: product.storeId,
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity,
        subtotal: lineSubtotal,
      };
    });
    if (products.length !== productIds.length)
      throw AppError.conflict('Product is no longer available');
    const total = checkedTotal(subtotal);
    for (const item of items) {
      const result = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity }, status: 'ACTIVE' },
        data: { stock: { decrement: item.quantity } },
      });
      if (result.count !== 1) throw AppError.conflict('Stock changed during checkout');
    }
    const status = input.paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT';
    const order = await tx.order.create({
      data: {
        orderNumber: `MM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID()}`,
        buyerId: userId,
        addressSnapshot: { ...input.address },
        subtotal,
        deliveryFee: env.DELIVERY_FEE_MMK,
        total,
        paymentMethod: input.paymentMethod,
        status,
        items: { create: items },
        statusHistory: { create: { oldStatus: '', newStatus: status, changedBy: userId } },
      },
      include: orderInclude,
    });
    await tx.cartItem.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    return serialize(order);
  });
}

export async function listOrders(userId: string, page: number, pageSize: number) {
  const where = { buyerId: userId };
  const [orders, total] = await getPrisma().$transaction([
    getPrisma().order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getPrisma().order.count({ where }),
  ]);
  return {
    items: orders.map(serialize),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getOrder(userId: string, id: string): Promise<OrderResponse> {
  const order = await getPrisma().order.findFirst({
    where: { id, buyerId: userId },
    include: orderInclude,
  });
  if (!order) throw AppError.notFound('Order not found');
  return serialize(order);
}

export async function cancelOrder(userId: string, id: string): Promise<OrderResponse> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders WHERE id = ${id} AND buyer_id = ${userId} FOR UPDATE`;
    if (!locked.length) throw AppError.notFound('Order not found');
    const order = await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    if (!canBuyerCancel(order))
      throw AppError.conflict('Order is no longer eligible for buyer cancellation');

    // Match checkout's store/product lock order. Deleted products retain their order snapshots.
    const storeIds = [...new Set(order.items.map((item) => item.storeId))].sort();
    const productIds = [
      ...new Set(order.items.flatMap((item) => (item.productId ? [item.productId] : []))),
    ].sort();
    if (storeIds.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM stores WHERE id IN (${Prisma.join(storeIds)}) ORDER BY id FOR UPDATE`,
      );
    if (productIds.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`,
      );
    for (const productId of productIds) {
      const quantity = order.items
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)
        throw AppError.conflict('Inventory cannot be restored safely');
      const restored = await tx.product.updateMany({
        where: { id: productId, stock: { lte: 2147483647 - quantity } },
        data: { stock: { increment: quantity } },
      });
      if (restored.count !== 1) throw AppError.conflict('Inventory cannot be restored safely');
    }
    await changeOrderStatus(tx, order, 'CANCELLED', userId);
    return serialize(await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude }));
  });
}
