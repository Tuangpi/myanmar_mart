# MyanMart — Project Tracking

> This is the project tracking file. For the product specification, see [`docs/PROJECT.md`](docs/PROJECT.md) and the rest of `docs/`.

## Goal

Build a Myanmar-first multi-vendor e-commerce marketplace where sellers can register, publish products, and manage orders, while buyers can discover products, place orders, and purchase from multiple sellers.

## Scope

### In scope (MVP)

- Authentication with role-based access: buyer, seller, admin.
- Buyer: browse, search, filter, product detail, cart, checkout, order history, order tracking, cancel eligible orders.
- Seller: store application, admin approval, store profile, product CRUD and publishing, image upload, stock, fulfillment, payment instructions, sales summary.
- Admin: user and seller management, category management, product moderation, order management, payment review, marketplace settings.
- Payments: cash on delivery, manual KBZPay / WavePay / bank transfer, receipt upload, manual verification.
- English and Burmese, mobile-first, MMK currency.

### Out of scope

Native mobile applications, automated delivery integrations, recommendation algorithms, microservices, advanced warehouse and accounting systems, payment provider APIs.

### Success criteria

- Sellers can register and publish products.
- Buyers can search products and place orders.
- Sellers can manage incoming orders.
- Buyers can submit payment information and track order status.
- Admins can manage sellers, products, and users.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- Backend: Node.js, Express, TypeScript.
- Database: PostgreSQL 18 (local dev cluster).
- ORM: Prisma.
- Validation: Zod.
- Auth: JWT in an httpOnly cookie, enforced on the backend.
- Storage: local server file storage for dev; S3-compatible storage in production.
- API: REST.
- Package manager: npm workspaces.
- Tests: Vitest for unit and API integration, Playwright for end-to-end.

## Architecture

Modular monolith. Frontend and backend are separate applications; one backend application and one primary database.

Backend modules: Auth and Users; Sellers and Stores; Products and Categories; Cart and Checkout; Orders and Inventory; Payments and Payment Verification; Admin and Moderation; Notifications.

### Project structure

    myanmart/
    ├── apps/
    │   ├── web/                # React + Vite frontend
    │   │   └── src/{components,features,pages,hooks,lib}
    │   └── api/                # Express + TypeScript backend
    │       └── src/{modules,middleware,lib,app.ts}
    ├── packages/
    │   └── shared/             # shared types, constants, Zod schemas
    ├── prisma/
    │   └── schema.prisma
    ├── docs/
    └── README.md

### Engineering rules

- Keep controllers thin; put business logic in services; use repositories only where they improve separation or testability.
- Validate request data with Zod.
- Use database transactions for checkout, inventory, and order creation.
- Enforce authorization on the backend.
- Store secrets in environment variables.
- Use pagination for product, seller, and order lists.
- Standardize API errors and responses.
- Never trust prices, roles, stock, or seller IDs supplied by the client.

## Key decisions

| #   | Decision                                                               | Rationale                                                                                  |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | npm workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`)    | Matches `docs/ARCHITECTURE.md`; npm is the only package manager installed                  |
| D2  | Prisma schema under `apps/api/prisma/schema.prisma`                    | Colocated with the only Prisma consumer (the API); single source of truth for migrations   |
| D3  | JWT access token in an httpOnly, SameSite cookie                       | Satisfies "secure session or JWT-based authentication" and keeps auth stateless            |
| D4  | Money stored as integer MMK                                            | Kyat has no minor unit in local practice; avoids floating-point rounding errors            |
| D5  | Local filesystem image storage behind a storage interface              | Matches the spec; swap for S3-compatible storage in production without changing call sites |
| D6  | Dedicated `myanmart` database and role on the local PostgreSQL cluster | Keeps dev data isolated from the system `postgres` superuser database                      |
| D7  | Order status changes driven by an explicit transition map              | Requirement: "Only allow valid status transitions"                                         |
| D8  | `order_items` snapshots `product_name` and `unit_price`                | Requirement: "Orders preserve product prices at purchase time"                             |

## Checkout decisions (T012)

- Checkout consumes the signed-in user's current cart. Client prices, totals, seller IDs and item lists are ignored.
- `DELIVERY_FEE_MMK` sets one flat delivery fee per combined order; defaults to 0 until a rate is configured. `GET /api/checkout` quotes current totals before submission.
- COD orders start `CONFIRMED` with payment `PENDING`; manual-transfer orders start `PENDING_PAYMENT`. Payment verification is required before processing prepaid orders.
- Existing order items provide seller grouping. Product names/prices and delivery details are snapshotted; store display names remain live. Per-seller fulfillment states are deferred to T016.
- Checkout serializes against cart edits, locks stores/products in stable order, decrements stock and clears purchased cart rows in the same transaction. Concurrent duplicate submissions against the same cart create at most one order; persisted idempotency keys are not implemented.

## Constraints

- Do not implement features outside the MVP without approval.
- Create database migrations and tests alongside features.
- Run type checks, linting, and tests after each phase.
- Never leave core workflows implemented only as mock data.
- Definition of done: a feature is complete only when its UI, API, validation, authorization, database changes, error handling, and relevant tests are implemented and verified.

## Source documents

- [`docs/PROJECT.md`](docs/PROJECT.md) — product overview and scope.
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — functional requirements and acceptance criteria.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, structure, engineering rules.
- [`docs/DATABASE_API.md`](docs/DATABASE_API.md) — tables, relationships, REST endpoints, security.
- [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) — phase plan and definition of done.
