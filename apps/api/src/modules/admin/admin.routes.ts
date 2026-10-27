import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { listSellers, updateSellerStatus } from '../seller/seller.controller.js';
import {
  listAdminProducts,
  updateAdminProductStatus,
  listAdminOrdersHandler,
  listAdminPayments,
  listAdminAudit,
  getAdminReport,
} from './admin.controller.js';

export const adminRouter = Router();

adminRouter.get('/admin/sellers', requireAuth, requireRole('ADMIN'), listSellers);
adminRouter.patch('/admin/sellers/:id/status', requireAuth, requireRole('ADMIN'), updateSellerStatus);
adminRouter.patch('/admin/sellers/:id', requireAuth, requireRole('ADMIN'), updateSellerStatus);

adminRouter.get('/admin/products', requireAuth, requireRole('ADMIN'), listAdminProducts);
adminRouter.patch('/admin/products/:id/status', requireAuth, requireRole('ADMIN'), updateAdminProductStatus);
adminRouter.patch('/admin/products/:id', requireAuth, requireRole('ADMIN'), updateAdminProductStatus);

adminRouter.get('/admin/orders', requireAuth, requireRole('ADMIN'), listAdminOrdersHandler);
adminRouter.get('/admin/payments', requireAuth, requireRole('ADMIN'), listAdminPayments);
adminRouter.get('/admin/audit', requireAuth, requireRole('ADMIN'), listAdminAudit);
adminRouter.get('/admin/audit-logs', requireAuth, requireRole('ADMIN'), listAdminAudit);
adminRouter.get('/admin/reports', requireAuth, requireRole('ADMIN'), getAdminReport);
adminRouter.get('/admin/report', requireAuth, requireRole('ADMIN'), getAdminReport);


