import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const healthModule = Router();
healthModule.use('/', healthRouter);
