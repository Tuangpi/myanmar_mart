import { PrismaClient, UserRole, CategoryStatus, StoreStatus, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@myanmart.mm' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@myanmart.mm',
      phone: '+959000000000',
      passwordHash: '$2b$10$placeholder.hash.for.seed.only',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  // Categories
  const categoryNames = [
    'Electronics',
    'Fashion',
    'Home & Living',
    'Food & Beverages',
    'Beauty & Personal Care',
    'Books & Stationery',
  ];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
        update: {},
        create: {
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          status: CategoryStatus.ACTIVE,
        },
      }),
    ),
  );

  // Demo seller
  const seller = await prisma.user.upsert({
    where: { email: 'seller@myanmart.mm' },
    update: {},
    create: {
      name: 'Demo Seller',
      email: 'seller@myanmart.mm',
      phone: '+959111111111',
      passwordHash: '$2b$10$placeholder.hash.for.seed.only',
      role: UserRole.SELLER,
      status: 'ACTIVE',
    },
  });

  // Demo store
  const store = await prisma.store.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      ownerId: seller.id,
      name: 'Demo Store',
      slug: 'demo-store',
      description: 'A demo seller storefront for MyanMart.',
      status: StoreStatus.APPROVED,
    },
  });

  // Demo products
  const electronics = categories.find((c) => c.slug === 'electronics') ?? categories[0];
  const fashion = categories.find((c) => c.slug === 'fashion') ?? categories[1];

  await prisma.product.upsert({
    where: { slug: 'wireless-headphones' },
    update: {},
    create: {
      storeId: store.id,
      categoryId: electronics.id,
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'High-quality wireless headphones with 30-hour battery life and active noise cancellation.',
      price: 89000,
      stock: 50,
      status: ProductStatus.ACTIVE,
      images: {
        create: [
          { imageUrl: 'https://placehold.co/600x600?text=Headphones+front', sortOrder: 0 },
          { imageUrl: 'https://placehold.co/600x600?text=Headphones+side', sortOrder: 1 },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'premium-coffee-beans' },
    update: {},
    create: {
      storeId: store.id,
      categoryId: categories.find((c) => c.slug === 'food-beverages')?.id ?? categories[3].id,
      name: 'Premium Coffee Beans',
      slug: 'premium-coffee-beans',
      description: 'Single-origin Arabica coffee beans, medium roast, 500g bag.',
      price: 12500,
      stock: 200,
      status: ProductStatus.ACTIVE,
      images: {
        create: [{ imageUrl: 'https://placehold.co/600x600?text=Coffee+bag', sortOrder: 0 }],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'ss02-draft' },
    update: {},
    create: {
      storeId: store.id,
      categoryId: fashion.id,
      name: 'Draft Sunglasses',
      slug: 'ss02-draft',
      description: 'Stylish sunglasses (draft — not yet published).',
      price: 25000,
      stock: 10,
      status: ProductStatus.DRAFT,
      images: {
        create: [{ imageUrl: 'https://placehold.co/600x600?text=Draft', sortOrder: 0 }],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'organic-coconut-oil' },
    update: {},
    create: {
      storeId: store.id,
      categoryId: categories.find((c) => c.slug === 'home-living')?.id ?? categories[2].id,
      name: 'Organic Coconut Oil',
      slug: 'organic-coconut-oil',
      description: 'Cold-pressed organic coconut oil, 1L bottle. Perfect for cooking and skincare.',
      price: 8500,
      stock: 0,
      status: ProductStatus.ACTIVE,
      images: {
        create: [{ imageUrl: 'https://placehold.co/600x600?text=Coconut+Oil', sortOrder: 0 }],
      },
    },
  });

  console.log('Seed complete:', {
    admin: { id: admin.id, email: admin.email, role: admin.role },
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    seller: { id: seller.id, email: seller.email, role: seller.role },
    store: { id: store.id, name: store.name, slug: store.slug, status: store.status },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
