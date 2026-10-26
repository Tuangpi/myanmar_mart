import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getPrisma } from '../../lib/prisma.js';

const app = createApp();
const prisma = getPrisma();

describe('public catalog API', () => {
  let testProductId: string;
  let testProductSlug: string;

  beforeAll(async () => {
    // Clean up all related tables
    await prisma.productImage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.store.deleteMany({});
    await prisma.user.deleteMany({});

    // Create owner user (required FK for stores)
    const user = await prisma.user.create({
      data: {
        name: 'Catalog Test Owner',
        email: 'catalog-test-owner@test.local',
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });

    // Create approved store with products
    const approvedStore = await prisma.store.create({
      data: {
        ownerId: user.id,
        name: 'Approved Store',
        slug: 'approved-store',
        description: 'An approved store',
        status: 'APPROVED',
      },
    });

    // Create pending (non-approved) store with a product
    const pendingStore = await prisma.store.create({
      data: {
        ownerId: user.id,
        name: 'Pending Store',
        slug: 'pending-store',
        description: 'A pending store',
        status: 'PENDING',
      },
    });

    // Create a product in the pending store (should not appear in public catalog)
    await prisma.product.create({
      data: {
        storeId: pendingStore.id,
        name: 'Hidden Product',
        slug: 'hidden-product',
        description: 'Hidden from public catalog',
        price: 9999,
        stock: 1,
        status: 'ACTIVE',
      },
    });

    // Create categories
    const electronics = await prisma.category.create({
      data: { name: 'Electronics', slug: 'electronics', status: 'ACTIVE' },
    });

    const fashion = await prisma.category.create({
      data: { name: 'Fashion', slug: 'fashion', status: 'ACTIVE' },
    });

    await prisma.category.create({
      data: { name: 'Deleted', slug: 'deleted', status: 'INACTIVE' },
    });

    // Create products in the approved store
    const laptop = await prisma.product.create({
      data: {
        storeId: approvedStore.id,
        categoryId: electronics.id,
        name: 'Laptop',
        slug: 'laptop',
        description: 'A powerful laptop',
        price: 150000,
        stock: 10,
        status: 'ACTIVE',
        images: {
          create: [
            { imageUrl: 'https://example.com/laptop1.jpg', sortOrder: 0 },
            { imageUrl: 'https://example.com/laptop2.jpg', sortOrder: 1 },
          ],
        },
      },
    });
    testProductId = laptop.id;
    testProductSlug = laptop.slug;

    await prisma.product.create({
      data: {
        storeId: approvedStore.id,
        categoryId: electronics.id,
        name: 'Smartphone',
        slug: 'smartphone',
        description: 'A modern smartphone',
        price: 80000,
        stock: 20,
        status: 'ACTIVE',
        images: {
          create: [{ imageUrl: 'https://example.com/phone1.jpg', sortOrder: 0 }],
        },
      },
    });

    await prisma.product.create({
      data: {
        storeId: approvedStore.id,
        categoryId: fashion.id,
        name: 'T-Shirt',
        slug: 't-shirt',
        description: 'A comfortable t-shirt',
        price: 5000,
        stock: 50,
        status: 'ACTIVE',
        images: {
          create: [{ imageUrl: 'https://example.com/tshirt1.jpg', sortOrder: 0 }],
        },
      },
    });

    // Create a draft product (should not appear in public catalog)
    await prisma.product.create({
      data: {
        storeId: approvedStore.id,
        categoryId: electronics.id,
        name: 'Draft Product',
        slug: 'draft-product',
        description: 'This is a draft',
        price: 1000,
        stock: 0,
        status: 'DRAFT',
      },
    });
  });

  afterAll(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.store.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  describe('GET /api/categories', () => {
    it('returns active categories only', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const slugs = res.body.data.map((c: { slug: string }) => c.slug);
      expect(slugs).toContain('electronics');
      expect(slugs).toContain('fashion');
      expect(slugs).not.toContain('deleted');
    });

    it('includes productCount for each category', async () => {
      const res = await request(app).get('/api/categories');
      const electronics = res.body.data.find((c: { slug: string }) => c.slug === 'electronics');

      expect(electronics.productCount).toBe(3);
    });
  });

  describe('GET /api/products', () => {
    it('returns paginated products from approved stores only', async () => {
      const res = await request(app).get('/api/products?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('page', 1);
      expect(res.body.data).toHaveProperty('pageSize', 10);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.total).toBe(3);
    });

    it('returns empty items for page beyond total', async () => {
      const res = await request(app).get('/api/products?page=999&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(3);
    });

    it('filters products by search query', async () => {
      const res = await request(app).get('/api/products?search=Laptop');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toBe('Laptop');
    });

    it('filters products by category slug', async () => {
      const res = await request(app).get('/api/products?categorySlug=electronics');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);
      const names = res.body.data.items.map((p: { name: string }) => p.name);
      expect(names).toContain('Laptop');
      expect(names).toContain('Smartphone');
    });

    it('sorts products by price ascending', async () => {
      const res = await request(app).get('/api/products?sortBy=price&sortOrder=asc');

      expect(res.status).toBe(200);
      const prices = res.body.data.items.map((p: { price: number }) => p.price);
      expect(prices).toEqual([...prices].sort((a: number, b: number) => a - b));
    });

    it('sorts products by price descending', async () => {
      const res = await request(app).get('/api/products?sortBy=price&sortOrder=desc');

      expect(res.status).toBe(200);
      const prices = res.body.data.items.map((p: { price: number }) => p.price);
      expect(prices).toEqual([...prices].sort((a: number, b: number) => b - a));
    });

    it('excludes draft and non-approved-store products', async () => {
      const res = await request(app).get('/api/products');

      const names = res.body.data.items.map((p: { name: string }) => p.name);
      expect(names).not.toContain('Draft Product');
      expect(names).not.toContain('Hidden Product');
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns product detail by UUID', async () => {
      const res = await request(app).get(`/api/products/${testProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testProductId);
      expect(res.body.data.name).toBe('Laptop');
      expect(res.body.data.slug).toBe('laptop');
      expect(res.body.data.price).toBe(150000);
      expect(res.body.data.description).toBe('A powerful laptop');
      expect(res.body.data.store.slug).toBe('approved-store');
      expect(res.body.data.category.slug).toBe('electronics');
      expect(Array.isArray(res.body.data.images)).toBe(true);
      expect(res.body.data.images.length).toBe(2);
    });

    it('returns product detail by slug', async () => {
      const res = await request(app).get(`/api/products/${testProductSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe(testProductSlug);
      expect(res.body.data.name).toBe('Laptop');
    });

    it('returns 404 for non-existent product UUID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/products/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 for non-existent product slug', async () => {
      const res = await request(app).get('/api/products/non-existent-product');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 for draft product (not visible)', async () => {
      const res = await request(app).get('/api/products/draft-product');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/stores/:slug', () => {
    it('returns an approved store with its active products', async () => {
      const res = await request(app).get('/api/stores/approved-store');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('approved-store');
      expect(res.body.data.name).toBe('Approved Store');
      expect(res.body.data.status).toBe('APPROVED');
      expect(Array.isArray(res.body.data.products)).toBe(true);
      expect(res.body.data.products.length).toBe(3);
    });

    it('returns 404 for non-existent store', async () => {
      const res = await request(app).get('/api/stores/non-existent-store');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 for pending (non-approved) store', async () => {
      const res = await request(app).get('/api/stores/pending-store');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});