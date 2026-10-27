import type { Prisma, OrderStatus } from '@prisma/client';
import { ORDER_TRANSITIONS } from '@myanmart/shared';
import { AppError } from '../../lib/errors.js';

// Caller must hold the order row lock. The status update and its history are inseparable.
export async function changeOrderStatus(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus },
  status: OrderStatus,
  actor: string,
) {
  if (!ORDER_TRANSITIONS[order.status].includes(status))
    throw AppError.conflict(`Invalid order transition: ${order.status} → ${status}`);
  return tx.order.update({
    where: { id: order.id },
    data: {
      status,
      statusHistory: { create: { oldStatus: order.status, newStatus: status, changedBy: actor } },
    },
  });
}
