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
