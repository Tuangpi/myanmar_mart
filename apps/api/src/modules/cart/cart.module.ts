import { Router, type Request, type Response } from 'express';
import { cartAddSchema, cartItemParamSchema, cartQuantitySchema } from '@myanmart/shared';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/errors.js';
import { cartAction } from './cart.service.js';

export const cartModule = Router();
cartModule.use('/cart', requireAuth);

cartModule.get('/cart', async (req: Request, res: Response) => {
  sendSuccess(res, await cartAction(req.user!.id, { kind: 'read' }));
});
cartModule.post('/cart/items', async (req: Request, res: Response) => {
  const input = cartAddSchema.parse(req.body);
  sendSuccess(res, await cartAction(req.user!.id, { kind: 'add', ...input }), 201);
});
cartModule.patch('/cart/items/:id', async (req: Request, res: Response) => {
  const { id } = cartItemParamSchema.parse(req.params);
  const { quantity } = cartQuantitySchema.parse(req.body);
  sendSuccess(res, await cartAction(req.user!.id, { kind: 'update', id, quantity }));
});
cartModule.delete('/cart/items/:id', async (req: Request, res: Response) => {
  const { id } = cartItemParamSchema.parse(req.params);
  sendSuccess(res, await cartAction(req.user!.id, { kind: 'remove', id }));
});
