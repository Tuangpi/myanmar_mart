import { getPrisma } from '../lib/prisma.js';
import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt.js';
import type { AuthUser, UserRole } from '@myanmart/shared';
import { AppError } from '../lib/errors.js';

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return req.cookies?.token;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next(AppError.unauthorized());
    return;
  }
  let id: string;
  try {
    id = verifyToken(token).id;
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
    return;
  }
  try {
    const user = await getPrisma().user.findUnique({ where: { id } });
    if (!user || user.status !== 'ACTIVE') {
      next(AppError.unauthorized('Invalid or expired token'));
      return;
    }
    // Read current roles so approval, demotion and suspension apply to existing tokens.
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      storeId: null,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
