import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { healthModule } from './modules/health/health.module.js';
import { authModule } from './modules/auth/auth.module.js';
import { catalogModule } from './modules/catalog/catalog.module.js';
import { sellerModule } from './modules/seller/seller.module.js';
import { adminModule } from './modules/admin/admin.module.js';
import { cartModule } from './modules/cart/cart.module.js';
import { ordersModule } from './modules/orders/orders.module.js';
import { paymentsModule } from './modules/payments/payments.module.js';
import { fulfillmentModule } from './modules/seller/fulfillment.module.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.use(env.API_PREFIX, healthModule);
  app.use(env.API_PREFIX, authModule);
  app.use(env.API_PREFIX, catalogModule);
  app.use(env.API_PREFIX, sellerModule);
  app.use(env.API_PREFIX, adminModule);
  app.use(env.API_PREFIX, cartModule);
  app.use(env.API_PREFIX, ordersModule);
  app.use(env.API_PREFIX, paymentsModule);
  app.use(env.API_PREFIX, fulfillmentModule);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
