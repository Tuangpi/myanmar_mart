import type { Prisma } from '@prisma/client';
import type { CartResponse } from '@myanmart/shared';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type CartAction =
  | { kind: 'read' }
  | { kind: 'add'; productId: string; quantity: number }
  | { kind: 'update'; id: string; quantity: number }
  | { kind: 'remove'; id: string };

async function snapshot(tx: Prisma.TransactionClient, userId: string): Promise<CartResponse> {
  const rows = await tx.cartItem.findMany({
    where: { cart: { userId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      product: {
        include: { store: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      },
    },
  });
  const items = rows.map(({ id, quantity, product }) => ({
    id,
    productId: product.id,
    name: product.name,
    slug: product.slug,
    thumbnailUrl: product.images[0]?.imageUrl ?? null,
    storeName: product.store.name,
    storeSlug: product.store.slug,
    quantity,
    stock: product.stock,
    available: product.status === 'ACTIVE' && product.store.status === 'APPROVED',
    unitPrice: product.price,
    subtotal: product.price * quantity,
  }));
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
  };
}

export async function cartAction(userId: string, action: CartAction): Promise<CartResponse> {
  return getPrisma().$transaction(async (tx) => {
    // Serialize each user's cart operations, including first-cart creation and repeated adds.
    // The existing schema permits multiple carts per user; no schema migration is needed.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (action.kind === 'read') return snapshot(tx, userId);

    const existing =
      action.kind === 'add'
        ? await tx.cartItem.findFirst({ where: { cart: { userId }, productId: action.productId } })
        : await tx.cartItem.findFirst({ where: { id: action.id, cart: { userId } } });

    if (action.kind !== 'add' && !existing) throw AppError.notFound('Cart item not found');
    if (action.kind === 'remove') {
      await tx.cartItem.delete({ where: { id: existing!.id } });
      return snapshot(tx, userId);
    }

    const productId = action.kind === 'add' ? action.productId : existing!.productId;
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { store: true },
    });
    if (!product || product.status !== 'ACTIVE' || product.store.status !== 'APPROVED') {
      throw AppError.conflict('Product is no longer available');
    }
    const quantity = action.quantity + (action.kind === 'add' ? (existing?.quantity ?? 0) : 0);
    if (quantity > product.stock || quantity > 2147483647) {
      throw AppError.conflict('Requested quantity exceeds available stock', {
        stock: product.stock,
      });
    }
    if (existing) {
      await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
    } else {
      const cart =
        (await tx.cart.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })) ??
        (await tx.cart.create({ data: { userId } }));
      await tx.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
    }
    return snapshot(tx, userId);
  });
}
