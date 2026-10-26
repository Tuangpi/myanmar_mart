import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  productListQuerySchema,
  productIdParamSchema,
  storeSlugParamSchema,
} from '@myanmart/shared';
import type { ProductListQuery, ProductIdParam, StoreSlugParam } from '@myanmart/shared';
import type { NextFunction, Request, Response } from 'express';

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();
    const categories = await prisma.category.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        _count: {
          select: { products: true },
        },
      },
    });

    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      productCount: c._count.products,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();

    const result = productListQuerySchema.safeParse(req.query);
    if (!result.success) {
      throw result.error;
    }
    const query: ProductListQuery = result.data;

    const where: any = {
      status: 'ACTIVE',
      store: { status: 'APPROVED' },
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.categorySlug) {
      where.category = { slug: query.categorySlug };
    }

    if (query.storeSlug) {
      where.store = { ...where.store, slug: query.storeSlug };
    }

    const orderBy: any = {};
    orderBy[query.sortBy] = query.sortOrder;

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          price: true,
          stock: true,
          images: {
            take: 1,
            select: { imageUrl: true },
          },
          store: {
            select: { name: true, slug: true },
          },
          category: {
            select: { name: true },
          },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    const items = products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: p.price,
      stock: p.stock,
      thumbnailUrl: p.images[0]?.imageUrl ?? null,
      storeName: p.store.name,
      storeSlug: p.store.slug,
      categoryName: p.category?.name ?? null,
    }));

    res.json({
      success: true,
      data: {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();

    const paramResult = productIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      throw paramResult.error;
    }
    const param: ProductIdParam = paramResult.data;
    const id = param.id;

    // Support lookup by UUID or slug
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const product = await prisma.product.findFirst({
      where: {
        ...(isUuid ? { id } : { slug: id }),
        status: 'ACTIVE',
        store: { status: 'APPROVED' },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        status: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            logoUrl: true,
            status: true,
          },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          select: { id: true, imageUrl: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

export async function getStoreBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();

    const paramResult = storeSlugParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      throw paramResult.error;
    }
    const param: StoreSlugParam = paramResult.data;

    const store = await prisma.store.findUnique({
      where: { slug: param.slug, status: 'APPROVED' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        status: true,
        products: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            slug: true,
            name: true,
            price: true,
            stock: true,
            images: {
              take: 1,
              select: { imageUrl: true },
            },
            category: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    });

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    const mappedStore = {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      logoUrl: store.logoUrl,
      status: store.status,
      products: store.products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        stock: p.stock,
        thumbnailUrl: p.images[0]?.imageUrl ?? null,
        categoryName: p.category?.name ?? null,
      })),
    };

    res.json({ success: true, data: mappedStore });
  } catch (err) {
    next(err);
  }
}