import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt.js';
import type { AuthUser, UserRole } from '@myanmart/shared';
import { AppError } from '../lib/errors.js';

declare module 'express' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
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

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next(AppError.unauthorized());
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.id,
      name: '',
      email: '',
      phone: null,
      role: payload.role,
      status: '',
      storeId: null,
    };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
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

