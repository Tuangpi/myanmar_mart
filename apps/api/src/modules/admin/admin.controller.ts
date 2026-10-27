import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { getPrisma } from '../../lib/prisma.js';
import {
  adminProductStatusSchema,
  paginationQuerySchema,
  productIdParamSchema,
} from '@myanmart/shared';
import type { AuthUser } from '@myanmart/shared';
import { listAdminOrders } from '../orders/orders.service.js';
import { listReviewOrders } from '../payments/payments.service.js';

const adminProductInclude = {
  store: { include: { owner: { select: { id: true, email: true, name: true } } } },
  category: true,
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
};

export async function listAdminProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = paginationQuerySchema.safeParse(req.query);
    if (!parsed.success) throw parsed.error;
    const query = parsed.data;
    const [products, total] = await getPrisma().$transaction([
      getPrisma().product.findMany({
        include: adminProductInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      getPrisma().product.count(),
    ]);
    res.json({
      success: true,
      data: {
        items: products.map((product) => ({
          id: product.id,
          storeId: product.storeId,
          storeName: product.store.name,
          storeSlug: product.store.slug,
          owner: product.store.owner,
          categoryId: product.categoryId,
          categoryName: product.category?.name ?? 'Uncategorized',
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          status: product.status,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
          images: product.images.map((image) => ({
            id: image.id,
            url: image.imageUrl,
            altText: null,
            sortOrder: image.sortOrder,
          })),
        })),
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

export async function updateAdminProductStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = productIdParamSchema.safeParse(req.params);
    if (!params.success) throw params.error;
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const actionMap: Record<string, string> = {
      activate: 'ACTIVE',
      active: 'ACTIVE',
      publish: 'ACTIVE',
      published: 'ACTIVE',
      archive: 'ARCHIVED',
      archived: 'ARCHIVED',
      draft: 'DRAFT',
    };
    const actionValue = raw.action ?? raw.operation ?? raw.decision;
    const statusFromAction = typeof actionValue === 'string' ? actionMap[actionValue.toLowerCase()] : undefined;
    const normalized = {
      status: raw.status ?? raw.productStatus ?? raw.state ?? statusFromAction,
    };
    const body = adminProductStatusSchema.safeParse(normalized);
    if (!body.success) throw body.error;
    const existing = await getPrisma().product.findUnique({ where: { id: params.data.id } });
    if (!existing) throw AppError.notFound('Product not found');
    const product = await getPrisma().product.update({
      where: { id: params.data.id },
      data: { status: body.data.status },
      include: adminProductInclude,
    });

    await getPrisma().auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        action: 'product.status.updated',
        entityType: 'product',
        entityId: params.data.id,
        metadata: { status: body.data.status, storeId: product.storeId },
      },
    });
    res.json({
      success: true,
      data: {
        id: product.id,
        storeId: product.storeId,
        storeName: product.store.name,
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? 'Uncategorized',
        name: product.name,
        price: product.price,
        stock: product.stock,
        status: product.status,
        updatedAt: product.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listAdminOrdersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = paginationQuerySchema.safeParse(req.query);
    if (!parsed.success) throw parsed.error;
    const data = await listAdminOrders(parsed.data.page, parsed.data.pageSize);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listAdminPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthorized();
    const parsed = paginationQuerySchema.safeParse(req.query);
    if (!parsed.success) throw parsed.error;
    const data = await listReviewOrders(req.user as AuthUser, parsed.data.page, parsed.data.pageSize);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}


export async function listAdminAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = paginationQuerySchema.safeParse(req.query);
    if (!parsed.success) throw parsed.error;
    const { page, pageSize } = parsed.data;
    const [logs, total] = await getPrisma().$transaction([
      getPrisma().auditLog.findMany({
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      getPrisma().auditLog.count(),
    ]);
    res.json({
      success: true,
      data: {
        items: logs.map((log) => ({
          id: log.id,
          actorId: log.actorId,
          actor: log.actor
            ? { id: log.actor.id, name: log.actor.name, email: log.actor.email, role: log.actor.role }
            : null,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
          timestamp: log.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminReport(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [
      storesTotal,
      storeStatusGroups,
      productsTotal,
      productStatusGroups,
      ordersTotal,
      orderStatusGroups,
      allRevenueAgg,
      deliveredRevenueAgg,
      paymentsTotal,
      paymentStatusGroups,
      sellerUsers,
    ] = await Promise.all([
      getPrisma().store.count(),
      getPrisma().store.groupBy({ by: ['status'], _count: { _all: true } }),
      getPrisma().product.count(),
      getPrisma().product.groupBy({ by: ['status'], _count: { _all: true } }),
      getPrisma().order.count(),
      getPrisma().order.groupBy({ by: ['status'], _count: { _all: true } }),
      getPrisma().order.aggregate({ _sum: { total: true } }),
      getPrisma().order.aggregate({ where: { status: 'DELIVERED' }, _sum: { total: true } }),
      getPrisma().payment.count(),
      getPrisma().payment.groupBy({ by: ['status'], _count: { _all: true } }),
      getPrisma().user.count({ where: { role: 'SELLER' } }),
    ]);

    const toCounts = (groups: any[]) => {
      const result: Record<string, number> = {};
      for (const group of groups) result[group.status] = group._count._all;
      return result;
    };

    const storeStatuses = toCounts(storeStatusGroups);
    const productStatuses = toCounts(productStatusGroups);
    const orderStatuses = toCounts(orderStatusGroups);
    const paymentStatuses = toCounts(paymentStatusGroups);

    const grossOrderValue = Number(allRevenueAgg._sum.total ?? 0);
    const deliveredRevenue = Number(deliveredRevenueAgg._sum.total ?? 0);

    const report = {
      generatedAt: new Date().toISOString(),
      sellers: {
        total: storesTotal,
        users: sellerUsers,
        byStatus: storeStatuses,
      },
      totalSellers: storesTotal,
      products: {
        total: productsTotal,
        byStatus: productStatuses,
      },
      totalProducts: productsTotal,
      orders: {
        total: ordersTotal,
        byStatus: orderStatuses,
      },
      totalOrders: ordersTotal,
      payments: {
        total: paymentsTotal,
        byStatus: paymentStatuses,
      },
      totalPayments: paymentsTotal,
      revenue: {
        gross: grossOrderValue,
        delivered: deliveredRevenue,
        total: deliveredRevenue,
      },
      totalRevenue: deliveredRevenue,
      grossOrderValue,
      deliveredRevenue,
    };

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}
