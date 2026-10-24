import { hashPassword, verifyPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { getPrisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { loginSchema, registerSchema } from '@myanmart/shared';
import type { NextFunction, Request, Response } from 'express';
import type { LoginInput, RegisterInput } from '@myanmart/shared';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const input: RegisterInput = parsed.data;

    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppError.conflict('A user with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: 'BUYER',
        status: 'ACTIVE',
      },
    });

    const authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      storeId: null,
    };

    const token = signToken(authUser);
    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(201)
      .json({ success: true, data: { user: authUser, token } });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const input: LoginInput = parsed.data;

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw AppError.forbidden('Your account has been suspended');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      storeId: null,
    };

    const token = signToken(authUser);
    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ success: true, data: { user: authUser, token } });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthorized();
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        stores: {
          select: { id: true, name: true, status: true },
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) {
      throw AppError.notFound('User not found');
    }

    // Prefer the newest approved store.
    const store = user.stores[0];

    const authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      storeId: store?.id ?? null,
      store: store
        ? { id: store.id, name: store.name, status: store.status }
        : null,
    };
    res.json({ success: true, data: authUser });
  } catch (err) {
    next(err);
  }
}
