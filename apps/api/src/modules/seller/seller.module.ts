import { Router } from 'express';
import { sellerRouter } from './seller.routes.js';

export const sellerModule = Router();
sellerModule.use('/', sellerRouter);