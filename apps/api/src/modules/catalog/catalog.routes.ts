import { Router } from 'express';
import {
  getCategories,
  getProducts,
  getProductById,
  getStoreBySlug,
} from './catalog.controller.js';

export const catalogRouter = Router();

catalogRouter.get('/categories', getCategories);
catalogRouter.get('/products', getProducts);
catalogRouter.get('/products/:id', getProductById);
catalogRouter.get('/stores/:slug', getStoreBySlug);