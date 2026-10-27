import { Router, type Request, type Response } from 'express';
import {
  orderIdParamSchema,
  paginationQuerySchema,
  sellerFulfillmentSchema,
  sellerPaymentInstructionsSchema,
} from '@myanmart/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/errors.js';
import {
  fulfillItem,
  listSellerOrders,
  sellerInstructions,
  sellerSummary,
} from './fulfillment.service.js';

export const fulfillmentModule = Router();
fulfillmentModule.use('/seller/orders', requireAuth, requireRole('SELLER'));
fulfillmentModule.use('/seller/sales-summary', requireAuth, requireRole('SELLER'));
fulfillmentModule.use('/seller/payment-instructions', requireAuth, requireRole('SELLER'));
fulfillmentModule.get('/seller/orders', async (req: Request, res: Response) => {
  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  sendSuccess(res, await listSellerOrders(req.user!.id, page, pageSize));
});
fulfillmentModule.patch('/seller/orders/:id/status', async (req: Request, res: Response) => {
  const { itemId, status } = sellerFulfillmentSchema.parse(req.body);
  sendSuccess(
    res,
    await fulfillItem(req.user!.id, orderIdParamSchema.parse(req.params).id, itemId, status),
  );
});
fulfillmentModule.get('/seller/sales-summary', async (req: Request, res: Response) => {
  sendSuccess(res, await sellerSummary(req.user!.id));
});
fulfillmentModule.get('/seller/payment-instructions', async (req: Request, res: Response) => {
  sendSuccess(res, await sellerInstructions(req.user!.id));
});
fulfillmentModule.patch('/seller/payment-instructions', async (req: Request, res: Response) => {
  sendSuccess(
    res,
    await sellerInstructions(req.user!.id, sellerPaymentInstructionsSchema.parse(req.body)),
  );
});
