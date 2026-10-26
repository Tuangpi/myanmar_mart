import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { SellerProductCreateInput, SellerProductUpdateInput } from '@myanmart/shared';

const include = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  category: { select: { id: true, name: true, slug: true } },
};

export async function ownedProduct(userId: string, id: string) {
  const product = await getPrisma().product.findFirst({
    where: { id, store: { ownerId: userId } },
    include,
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function listProducts(userId: string, page: number, pageSize: number) {
  const where = { store: { ownerId: userId } };
  const [items, total] = await getPrisma().$transaction([
    getPrisma().product.findMany({
      where,
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getPrisma().product.count({ where }),
  ]);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// Lock the store before checking approval, so moderation and publishing serialize.
async function lockedStore(tx: Prisma.TransactionClient, userId: string) {
  const stores = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status FROM stores WHERE owner_id = ${userId} ORDER BY created_at LIMIT 1 FOR UPDATE`;
  if (!stores[0]) throw AppError.forbidden('Seller store not found');
  return stores[0];
}

export async function saveProduct(
  userId: string,
  input: SellerProductCreateInput | SellerProductUpdateInput,
  id?: string,
) {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const store = await lockedStore(tx, userId);
      if (id && !(await tx.product.findFirst({ where: { id, storeId: store.id } }))) {
        throw AppError.notFound('Product not found');
      }
      if (input.status === 'ACTIVE' && store.status !== 'APPROVED') {
        throw AppError.forbidden('Store must be approved to publish products');
      }
      if (
        input.categoryId &&
        !(await tx.category.findFirst({ where: { id: input.categoryId, status: 'ACTIVE' } }))
      ) {
        throw AppError.badRequest('Invalid category');
      }
      if (id) return tx.product.update({ where: { id }, data: input, include });
      const data = input as SellerProductCreateInput;
      // UUID fallback supports Burmese product names without lossy transliteration.
      const slug =
        data.slug ??
        `${
          data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 23) || 'product'
        }-${randomUUID()}`;
      return tx.product.create({ data: { ...data, slug, storeId: store.id }, include });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('Product slug is already taken');
    }
    throw err;
  }
}

export async function attachImage(userId: string, id: string, imageUrl: string) {
  return getPrisma().$transaction(async (tx) => {
    const store = await lockedStore(tx, userId);
    if (!(await tx.product.findFirst({ where: { id, storeId: store.id } })))
      throw AppError.notFound('Product not found');
    const last = await tx.productImage.findFirst({
      where: { productId: id },
      orderBy: { sortOrder: 'desc' },
    });
    const count = await tx.productImage.count({ where: { productId: id } });
    if (count >= 10) throw AppError.badRequest('Maximum 10 images per product');
    return tx.productImage.create({
      data: { productId: id, imageUrl, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
  });
}
