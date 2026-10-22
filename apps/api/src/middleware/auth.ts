import type { NextFunction, Request, Response } from 'express';

/**
 * Placeholder auth middleware for the scaffold. Replaced by real JWT
 * verification and role checks in T003.
 */
export function requireAuth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export function requireRole(..._roles: string[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}
