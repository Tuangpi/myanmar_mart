import { Router } from 'express';
import { applySeller, getMyStore } from './seller.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  listSellerProducts,
  createSellerProduct,
  getSellerProduct,
  updateSellerProduct,
  archiveSellerProduct,
  updateSellerStock,
  checkProductOwner,
  parseProductImage,
  uploadProductImage,
  serveProductImage,
} from './product.controller.js';

export const sellerRouter = Router();

sellerRouter.post('/seller/apply', requireAuth, applySeller);
sellerRouter.get('/seller/store', requireAuth, getMyStore);
sellerRouter.get('/product-images/:key', serveProductImage);
sellerRouter.use('/seller/products', requireAuth, requireRole('SELLER'));
sellerRouter.get('/seller/products', listSellerProducts);
sellerRouter.post('/seller/products', createSellerProduct);
sellerRouter.get('/seller/products/:id', getSellerProduct);
sellerRouter.patch('/seller/products/:id', updateSellerProduct);
sellerRouter.delete('/seller/products/:id', archiveSellerProduct);
sellerRouter.patch('/seller/products/:id/stock', updateSellerStock);
sellerRouter.post(
  '/seller/products/:id/images',
  checkProductOwner,
  parseProductImage,
  uploadProductImage,
);
