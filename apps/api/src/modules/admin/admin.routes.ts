import { Router } from 'express';
import { listSellers, updateSellerStatus } from '../seller/seller.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const adminRouter = Router();

adminRouter.get('/admin/sellers', requireAuth, requireRole('ADMIN'), listSellers);
adminRouter.patch('/admin/sellers/:id/status', requireAuth, requireRole('ADMIN'), updateSellerStatus);