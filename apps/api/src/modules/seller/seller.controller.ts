import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  sellerApplySchema,
  adminSellerStatusSchema,
} from '@myanmart/shared';
import type { SellerApplyInput, AdminSellerStatusInput } from '@myanmart/shared';
import type { NextFunction, Request, Response } from 'express';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function applySeller(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthorized();
    }

    const raw = (req.body ?? {}) as Record<string, unknown>;
    const rawLogo = raw.logoUrl ?? raw.logo ?? raw.logo_url;
    const normalized = {
      name: raw.name ?? raw.storeName ?? raw.store_name,
      slug: slugify(String(raw.slug ?? raw.storeSlug ?? raw.store_slug ?? raw.name ?? raw.storeName ?? '')),
      description: raw.description ?? raw.storeDescription ?? raw.store_description ?? null,
      logoUrl: rawLogo === '' || rawLogo === undefined ? null : rawLogo,
    };

    const parsed = sellerApplySchema.safeParse(normalized);
    if (!parsed.success) {
      throw parsed.error;
    }
    const input: SellerApplyInput = parsed.data;

    const prisma = getPrisma();

    // Prevent duplicate store applications for the same owner.
    const existing = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
    if (existing) {
      throw AppError.conflict('You already have a store application');
    }

    const slugTaken = await prisma.store.findUnique({ where: { slug: input.slug } });
    if (slugTaken) {
      throw AppError.conflict('Store slug is already taken');
    }

    const store = await prisma.store.create({
      data: {
        ownerId: req.user.id,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        logoUrl: input.logoUrl ?? null,
        status: 'PENDING',
      },
    });

    // Promote the applicant to the seller role so they can access seller routes.
    await prisma.user.update({
      where: { id: req.user.id },
      data: { role: 'SELLER' },
    });

    res.status(201).json({ success: true, data: store });
  } catch (err) {
    next(err);
  }
}

export async function getMyStore(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthorized();
    }

    const prisma = getPrisma();
    const stores = await prisma.store.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: stores });
  } catch (err) {
    next(err);
  }
}

export async function listSellers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { id: true, name: true, email: true, role: true, status: true },
        },
      },
    });

    res.json({ success: true, data: stores });
  } catch (err) {
    next(err);
  }
}

export async function updateSellerStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prisma = getPrisma();

    const raw = (req.body ?? {}) as Record<string, unknown>;
    const actionMap: Record<string, string> = {
      approve: 'APPROVED',
      approved: 'APPROVED',
      reject: 'REJECTED',
      rejected: 'REJECTED',
      suspend: 'SUSPENDED',
      suspended: 'SUSPENDED',
      pending: 'PENDING',
    };
    const actionValue = raw.action ?? raw.operation ?? raw.decision;
    const statusFromAction = typeof actionValue === 'string' ? actionMap[actionValue.toLowerCase()] : undefined;
    const normalized = {
      status: raw.status ?? raw.storeStatus ?? raw.sellerStatus ?? raw.state ?? statusFromAction,
    };
    const parsed = adminSellerStatusSchema.safeParse(normalized);
    if (!parsed.success) {
      throw parsed.error;
    }
    const input: AdminSellerStatusInput = parsed.data;

    const id = String(req.params.id);

    let store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      store = await prisma.store.findFirst({ where: { ownerId: id } });
    }
    if (!store) {
      throw AppError.notFound('Seller not found');
    }

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { status: input.status },
      include: {
        owner: {
          select: { id: true, name: true, email: true, role: true, status: true },
        },
      },
    });

    // Keep owner role aligned with store lifecycle.
    if (input.status === 'APPROVED') {
      await prisma.user.update({
        where: { id: store.ownerId },
        data: { role: 'SELLER' },
      });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}