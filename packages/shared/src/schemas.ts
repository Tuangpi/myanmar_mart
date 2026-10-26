import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(20),
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// --- Catalog public API schemas (T005) ---

export const productSortFields = ['name', 'price', 'createdAt'] as const;
export type ProductSortField = (typeof productSortFields)[number];

export const productListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  categorySlug: z.string().trim().min(1).optional(),
  storeSlug: z.string().trim().min(1).optional(),
  sortBy: z.enum(productSortFields).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;

export const storeSlugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

export type StoreSlugParam = z.infer<typeof storeSlugParamSchema>;

// --- Seller application schemas (T008) ---

export const sellerApplySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).optional().nullable(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
});

export type SellerApplyInput = z.infer<typeof sellerApplySchema>;

export const adminSellerStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
});

// --- Seller product management schemas (T009) ---

export type AdminSellerStatusInput = z.infer<typeof adminSellerStatusSchema>;

export const productStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatusValue = (typeof productStatuses)[number];

export const sellerProductCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    price: z.number().int().min(1).max(2147483647),
    stock: z.number().int().min(0).max(2147483647).default(0),
    categoryId: z.string().uuid().optional().nullable(),
    status: z.enum(productStatuses).default('DRAFT'),
  })
  .strict();

export type SellerProductCreateInput = z.infer<typeof sellerProductCreateSchema>;

export const sellerProductUpdateSchema = sellerProductCreateSchema
  .extend({
    stock: z.number().int().min(0).max(2147483647),
    status: z.enum(productStatuses),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

export type SellerProductUpdateInput = z.infer<typeof sellerProductUpdateSchema>;

export const sellerProductIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type SellerProductIdParam = z.infer<typeof sellerProductIdParamSchema>;

export const sellerProductStockSchema = z
  .object({
    stock: z.number().int().min(0).max(2147483647),
  })
  .strict();

export type SellerProductStockInput = z.infer<typeof sellerProductStockSchema>;
