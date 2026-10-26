import { Router } from 'express';
import { applySeller, getMyStore } from './seller.controller.js';
import { requireAuth } from '../../middleware/auth.js';

export const sellerRouter = Router();

sellerRouter.post('/seller/apply', requireAuth, applySeller);
sellerRouter.get('/seller/store', requireAuth, getMyStore);