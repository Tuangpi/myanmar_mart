import { Router } from 'express';
import { adminRouter } from './admin.routes.js';

export const adminModule = Router();
adminModule.use('/', adminRouter);