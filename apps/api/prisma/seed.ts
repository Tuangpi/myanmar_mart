import { PrismaClient, UserRole, CategoryStatus, StoreStatus } from '@prisma/client';

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
