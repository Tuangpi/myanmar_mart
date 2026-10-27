import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  orderIdParamSchema,
  paginationQuerySchema,
  paymentSubmissionSchema,
  paymentReviewSchema,
  orderTransitionSchema,
} from '@myanmart/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, sendSuccess } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import {
  readPayments,
  submitPayment,
  receiptPath,
  listReviewOrders,
  reviewPayment,
  transitionOrder,
} from './payments.service.js';

export const paymentsModule = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
    fields: 1,
    fieldSize: 1000,
  },
  fileFilter: (_req, file, cb) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))
      cb(AppError.badRequest('Only PNG, JPEG and WebP receipts are allowed'));
    else cb(null, true);
  },
}).single('receipt');
const params = z.object({ id: z.string().uuid(), paymentId: z.string().uuid() });

paymentsModule.get('/orders/:id/payments', requireAuth, async (req: Request, res: Response) => {
  sendSuccess(res, await readPayments(req.user!, orderIdParamSchema.parse(req.params).id));
});
paymentsModule.post(
  '/orders/:id/payments',
  requireAuth,
  async (req: Request, _res: Response, next: NextFunction) => {
    await readPayments(req.user!, orderIdParamSchema.parse(req.params).id);
    next();
  },
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) =>
      next(
        err instanceof multer.MulterError
          ? AppError.badRequest('Receipt exceeds upload limits')
          : err,
      ),
    );
  },
  async (req: Request, res: Response) => {
    const { transactionReference } = paymentSubmissionSchema.parse(req.body);
    if (!req.file) throw AppError.badRequest('A receipt image is required');
    sendSuccess(
      res,
      await submitPayment(
        req.user!,
        orderIdParamSchema.parse(req.params).id,
        transactionReference,
        req.file,
      ),
      201,
    );
  },
);
paymentsModule.get(
  '/orders/:id/payments/:paymentId/receipt',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const { id, paymentId } = params.parse(req.params);
    const file = await receiptPath(req.user!, id, paymentId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(file, (err) => {
      if (err) next(AppError.notFound('Receipt not found'));
    });
  },
);
for (const role of ['admin', 'seller'] as const) {
  const base = `/${role}/payment-orders`;
  paymentsModule.use(base, requireAuth, requireRole(role === 'admin' ? 'ADMIN' : 'SELLER'));
  paymentsModule.get(base, async (req: Request, res: Response) => {
    const { page, pageSize } = paginationQuerySchema.parse(req.query);
    sendSuccess(res, await listReviewOrders(req.user!, page, pageSize));
  });
  paymentsModule.post(
    `${base}/:id/payments/:paymentId/review`,
    async (req: Request, res: Response) => {
      const { id, paymentId } = params.parse(req.params);
      sendSuccess(
        res,
        await reviewPayment(req.user!, id, paymentId, paymentReviewSchema.parse(req.body).decision),
      );
    },
  );
  paymentsModule.post(`${base}/:id/status`, async (req: Request, res: Response) => {
    const { status, transactionReference } = orderTransitionSchema.parse(req.body);
    sendSuccess(
      res,
      await transitionOrder(
        req.user!,
        orderIdParamSchema.parse(req.params).id,
        status,
        transactionReference,
      ),
    );
  });
}
