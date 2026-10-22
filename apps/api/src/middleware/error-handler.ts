import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError, sendFailure } from '../lib/errors.js';

export function notFoundHandler(req: Request, res: Response): void {
  sendFailure(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`);
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    sendFailure(
      res,
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
    return;
  }

  if (err instanceof AppError) {
    sendFailure(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  console.error('[unhandled]', err);

  sendFailure(
    res,
    500,
    'INTERNAL_ERROR',
    env.NODE_ENV === 'production' ? 'Internal server error' : message,
  );
}
