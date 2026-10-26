# MyanMart — Tasks

Status legend: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED`

All tasks start at `TODO` unless noted. A task is `DONE` only when its expected result exists **and** its completion check passes.

## Phase 1 — Foundation

### T001 — Monorepo scaffold and toolchain

- **Status:** DONE
- **Expected result:** npm-workspaces monorepo with `apps/web` (Vite + React + TS), `apps/api` (Express + TS), `packages/shared`; root TypeScript, ESLint, and Prettier configs; `.gitignore`; validated environment loading.
- **Completion check:** `npm install` succeeds at root; `npm run typecheck`, `npm run lint`, and `npm run build` pass in both apps; API boots and responds to a health endpoint.
- **Dependencies:** —

### T002 — Database schema, migrations, and seed

- **Status:** DONE
- **Expected result:** Prisma schema at `apps/api/prisma/schema.prisma` with the 12 core tables (users, addresses, stores, categories, products, product_images, carts, cart_items, orders, order_items, payments, order_status_history) using UUID primary keys, foreign keys, timestamps, and indexes; money as integer MMK; initial migration plus a seed script for admin, categories, and a demo seller. Migrations and seed scripts also live under `apps/api/prisma/`.
- **Completion check:** `prisma migrate dev` applies cleanly on a fresh local database from `apps/api/`; `prisma migrate reset` plus seed succeeds; `prisma studio` lists all tables with the expected columns and relations.
- **Dependencies:** T001

### T003 — Authentication and role-based access control

- **Status:** DONE
- **Expected result:** Register, login, logout, and `GET /api/auth/me`; password hashing; JWT in an httpOnly cookie; `requireAuth` and `requireRole` middleware for buyer, seller, and admin; rate limiting on auth endpoints; standardized error responses.
- **Completion check:** API tests cover register, login, logout, duplicate email, wrong password, missing token, wrong role, and forbidden admin access.
- **Dependencies:** T002

### T004 — Application shell, layout, and i18n

- **Status:** DONE
- **Expected result:** Responsive mobile-first layout with Tailwind CSS and shadcn/ui; Burmese and English language support with a language switcher and persisted choice; shared UI primitives in `packages/shared` where reusable.
- **Completion check:** App renders at mobile and desktop widths; switching language updates visible UI text and the choice survives a page reload; page components (Home, Catalog, Product Detail, Cart, Orders, Profile) use I18nLayout and translations.
- **Dependencies:** T001

## Phase 2 — Marketplace

### T005 — Public catalog API

- **Status:** DONE
- **Expected result:** `GET /api/categories`, `GET /api/products` with search, filter, sort, and pagination, `GET /api/products/:id`, and `GET /api/stores/:slug`; Zod validation; server-side pagination.
- **Completion check:** API tests cover pagination boundaries, an unknown product id returning 404, and a search filter narrowing results.
- **Dependencies:** T002

### T006 — Buyer catalog browsing UI

- **Status:** DONE
- **Expected result:** Product grid, category browsing, search box with debounce, filter and sort controls, and pagination wired to T005.
- **Completion check:** UI shows products loaded from the API (no mock data), and changing a filter updates the displayed results.
- **Dependencies:** T004, T005

### T007 — Product detail page

- **Status:** DONE
- **Expected result:** Product page showing images, price, stock, description, category, and seller link; displays an out-of-stock state when stock is zero.
- **Completion check:** A known product renders all fields from the API and links to the seller's storefront.
- **Dependencies:** T006

### T008 — Seller application and admin approval

- **Status:** DONE
- **Expected result:** Seller submits store information; admin approves, suspends, or rejects; store status gates product publishing; rejected and suspended states are surfaced to the applicant.
- **Completion check:** API tests confirm a non-approved seller cannot publish, and that admin approval is required before the store becomes active.
- **Dependencies:** T003

### T009 — Seller product and inventory management

- **Status:** TODO
- **Expected result:** Seller product list, create, edit, publish, and archive; stock management; product image upload with type and size validation; seller-only access control on every product.
- **Completion check:** A seller can create and publish a product end to end, and API tests confirm one seller cannot read or modify another seller's product.
- **Dependencies:** T008, T005

### T010 — Public seller storefront page

- **Status:** TODO
- **Expected result:** Public storefront at the store slug showing store name, logo, description, and its active products.
- **Completion check:** Visiting a store slug renders its profile and product list.
- **Dependencies:** T007, T005

## Phase 3 — Shopping

### T011 — Cart

- **Status:** TODO
- **Expected result:** `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`, plus the cart UI with quantity edits and removal; cart scoped to the signed-in user.
- **Completion check:** API tests cover add, update quantity, remove, and the quantity cap against available stock.
- **Dependencies:** T003, T005

### T012 — Checkout and transactional order creation

- **Status:** TODO
- **Expected result:** `POST /api/orders` creating an order inside a database transaction; server-recalculated prices and totals; transactional stock checks and decrements; delivery address snapshot and contact number; multi-seller order grouping; delivery fee; order number generation; `GET /api/orders` and `GET /api/orders/:id`.
- **Completion check:** A checkout spanning two sellers produces one customer-facing order with separate seller groups and correct per-seller totals; API tests confirm client-supplied prices are ignored and that insufficient stock fails without creating an order or decrementing stock.
- **Dependencies:** T011, T002

### T013 — Buyer order history and order details

- **Status:** TODO
- **Expected result:** Order list and order detail pages grouped by seller, showing items, totals, payment method, and current status; a buyer can cancel only eligible orders via `POST /api/orders/:id/cancel`.
- **Completion check:** A buyer sees their own orders only and can cancel one in a cancellable state.
- **Dependencies:** T012

## Phase 4 — Payments and fulfillment

### T014 — Payment methods and manual payment submission

- **Status:** TODO
- **Expected result:** Cash on delivery plus manual KBZPay, WavePay, and bank transfer; `POST /api/orders/:id/payments` accepting a transaction reference and receipt image; seller or marketplace payment instructions displayed; multiple payment attempts supported; no wallet PINs or payment credentials stored.
- **Completion check:** A prepaid order cannot advance until a payment record exists, and receipt uploads reject disallowed file types and oversized files.
- **Dependencies:** T012

### T015 — Payment verification and order status state machine

- **Status:** TODO
- **Expected result:** Admin and seller payment verification writing `verified_by`; the eight statuses (Pending Payment, Payment Submitted, Confirmed, Processing, Shipped, Delivered, Cancelled, Refunded) driven by an explicit transition map; every change recorded in `order_status_history`; refunds recorded manually.
- **Completion check:** API tests confirm an invalid transition is rejected and that every accepted transition writes exactly one history row.
- **Dependencies:** T014, T008

### T016 — Seller fulfillment and buyer order tracking

- **Status:** TODO
- **Expected result:** `GET /api/seller/orders` and `PATCH /api/seller/orders/:id/status` limited to the seller's own items; seller order board; buyer-facing live status timeline; seller payment instructions management and a basic sales summary.
- **Completion check:** A seller sees only orders containing their products, and API tests confirm a seller cannot update another seller's order item.
- **Dependencies:** T015

## Phase 5 — Administration

### T017 — Admin dashboard and moderation

- **Status:** TODO
- **Expected result:** `GET /api/admin/sellers`, `PATCH /api/admin/sellers/:id/status`, `GET /api/admin/products`, `GET /api/admin/orders`, `GET /api/admin/payments`; dashboard, seller management, product moderation, order management, and payment review screens; category management; marketplace settings.
- **Completion check:** An admin can approve a seller and moderate a listing; API tests confirm every admin route rejects buyer and seller roles.
- **Dependencies:** T008

### T018 — Audit trail and marketplace reports

- **Status:** TODO
- **Expected result:** Recorded payment verification and administrative actions exposed through the admin UI; basic marketplace reports on orders, revenue, and sellers.
- **Completion check:** An administrative action appears in the audit view with actor and timestamp, and a report renders totals for seeded data.
- **Dependencies:** T017

## Phase 6 — Testing and deployment

### T019 — Test suite

- **Status:** TODO
- **Expected result:** Unit and API integration tests (Vitest) and critical end-to-end tests (Playwright) covering buyer, seller, and admin authorization, concurrent purchases and stock consistency, and the buyer-to-seller purchasing workflow.
- **Completion check:** The full suite passes; a concurrency test proves no overselling under parallel checkout attempts.
- **Dependencies:** T012, T015

### T020 — Production configuration and deployment

- **Status:** TODO
- **Expected result:** Production environment variables, HTTPS, backups, logging, and error monitoring; deployment of frontend, API, database, and private file storage; documented setup instructions and an environment variable reference in the README.
- **Completion check:** A clean checkout installs and starts using only the documented environment variables, with the full test suite green.
- **Dependencies:** T019
