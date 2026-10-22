import { Router } from 'express';
import type { HealthResponse } from '@myanmart/shared';
import { sendSuccess } from '../../lib/errors.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'myanmart-api',
    timestamp: new Date().toISOString(),
  };
  sendSuccess(res, body);
});
