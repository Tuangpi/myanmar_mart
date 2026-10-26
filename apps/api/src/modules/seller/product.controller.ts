import type { Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import {
  paginationQuerySchema,
  sellerProductCreateSchema,
  sellerProductUpdateSchema,
  sellerProductIdParamSchema,
  sellerProductStockSchema,
} from '@myanmart/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { getPrisma } from '../../lib/prisma.js';
import { productImageStorage } from '../../lib/product-image-storage.js';
import { attachImage, listProducts, ownedProduct, saveProduct } from './product.service.js';

const handler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const productId = (req: Request) => sellerProductIdParamSchema.parse(req.params).id;

export const listSellerProducts = handler(async (req, res) => {
  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  res.json({ success: true, data: await listProducts(req.user!.id, page, pageSize) });
});
export const createSellerProduct = handler(async (req, res) => {
  const data = await saveProduct(req.user!.id, sellerProductCreateSchema.parse(req.body));
  res.status(201).json({ success: true, data });
});
export const getSellerProduct = handler(async (req, res) => {
  res.json({ success: true, data: await ownedProduct(req.user!.id, productId(req)) });
});
export const updateSellerProduct = handler(async (req, res) => {
  const data = await saveProduct(
    req.user!.id,
    sellerProductUpdateSchema.parse(req.body),
    productId(req),
  );
  res.json({ success: true, data });
});
export const archiveSellerProduct = handler(async (req, res) => {
  const data = await saveProduct(req.user!.id, { status: 'ARCHIVED' }, productId(req));
  res.json({ success: true, data });
});
export const updateSellerStock = handler(async (req, res) => {
  const data = await saveProduct(
    req.user!.id,
    sellerProductStockSchema.parse(req.body),
    productId(req),
  );
  res.json({ success: true, data });
});

// Check ownership before allocating upload buffers or writing any files.
export function checkProductOwner(req: Request, _res: Response, next: NextFunction): void {
  void Promise.resolve()
    .then(() => ownedProduct(req.user!.id, productId(req)))
    .then(() => next())
    .catch(next);
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(AppError.badRequest('Unsupported image type'));
  },
}).single('image');
export function parseProductImage(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) =>
    next(err instanceof multer.MulterError ? AppError.badRequest(err.message) : err),
  );
}
export const uploadProductImage = handler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Provide an image');
  const key = await productImageStorage.save(req.file.buffer, req.file.mimetype);
  try {
    const data = await attachImage(
      req.user!.id,
      productId(req),
      `${env.API_PREFIX}/product-images/${key}`,
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    await productImageStorage.remove(key);
    throw err;
  }
});
export const serveProductImage = handler(async (req, res) => {
  const key = String(req.params.key);
  const file = productImageStorage.path(key);
  const image = await getPrisma().productImage.findFirst({
    where: {
      imageUrl: `${env.API_PREFIX}/product-images/${key}`,
      product: { status: 'ACTIVE', store: { status: 'APPROVED' } },
    },
  });
  if (!image) throw AppError.notFound('Image not found');
  res.set('Cache-Control', 'no-store');
  await new Promise<void>((resolve, reject) =>
    res.sendFile(file, (err) => (err ? reject(AppError.notFound('Image not found')) : resolve())),
  );
});
