import { Router, type Request, type Response } from 'express';
import { checkoutSchema, orderIdParamSchema, paginationQuerySchema } from '@myanmart/shared';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/errors.js';
import { checkoutQuote, createOrder, getOrder, listOrders } from './orders.service.js';

export const ordersModule = Router();
ordersModule.get('/checkout', requireAuth, async (req: Request, res: Response) => {
  sendSuccess(res, await checkoutQuote(req.user!.id));
});
ordersModule.use('/orders', requireAuth);
ordersModule.post('/orders', async (req: Request, res: Response) => {
  sendSuccess(res, await createOrder(req.user!.id, checkoutSchema.parse(req.body)), 201);
});
ordersModule.get('/orders', async (req: Request, res: Response) => {
  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  sendSuccess(res, await listOrders(req.user!.id, page, pageSize));
});
ordersModule.get('/orders/:id', async (req: Request, res: Response) => {
  sendSuccess(res, await getOrder(req.user!.id, orderIdParamSchema.parse(req.params).id));
});
