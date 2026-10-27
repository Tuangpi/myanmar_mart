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
- Existing order items provide seller grouping. Product names/prices and delivery details are snapshotted; store display names remain live. Item-level fulfillment is implemented in T016.
- Checkout serializes against cart edits, locks stores/products in stable order, decrements stock and clears purchased cart rows in the same transaction. Concurrent duplicate submissions against the same cart create at most one order; persisted idempotency keys are not implemented.

## Buyer cancellation (T013)

- Buyer history/detail pages use owner-scoped order APIs. Responses expose server-calculated `canCancel` for the UI; the cancellation endpoint independently rechecks eligibility.
- Buyers may cancel unpaid COD orders in `CONFIRMED`, or unpaid manual-payment orders in `PENDING_PAYMENT`. Payment status must be `PENDING` or `REJECTED`, with no submitted, verified or refunded payment attempt. Every item must still be unprocessed. Processing and later states are not buyer-cancellable.
- Cancellation applies to the whole order. An order-row lock prevents duplicate cancellation; inventory restoration, status update and history insertion are atomic. Deleted products are skipped while snapshots remain; inventory overflow rejects cancellation without partial changes.
- Payment/fulfillment writers lock the order row before checking/changing payment or order state, so they serialize with cancellation.

## Payments and order transitions (T014–T015)

- Marketplace receiving instructions use `PAYMENT_INSTRUCTIONS_KBZPAY`, `PAYMENT_INSTRUCTIONS_WAVEPAY`, and `PAYMENT_INSTRUCTIONS_BANK_TRANSFER`. Empty configuration disables submission and shows a contact-marketplace message. Configure public receiving details only, never PINs or passwords. T016 adds store-level overrides for single-store orders only.
- Buyers submit a transaction reference and a PNG/JPEG/WebP receipt using multipart `POST /api/orders/:id/payments`. Amount and method come from the locked order. Rejection permits another attempt; pending review blocks duplicate attempts and cancellation.
- Receipt files use a separate private storage directory and authenticated, owner/reviewer-scoped download routes. Admins can review all orders. Approved sellers can review only orders whose every item belongs to their approved stores; mixed-seller payments require an admin.
- An explicit shared transition map and transactional writer record one history entry per status change. Submission/review, buyer cancellation, fulfillment transitions and refunds acquire the order-row lock. Checkout writes the initial history entry atomically.
- Verification records `verified_by`, confirms prepaid orders, and is mandatory before processing. Rejection returns to Pending Payment. Whole-order review/status UI is at `#/payments/admin` and `#/payments/seller`; item fulfillment is at `#/seller/orders`.
- COD delivery explicitly acknowledges cash collection and creates a verified payment. Full refunds require a verified collection and a manual refund reference; they create a separate REFUNDED payment record, preserve the original verification and set the order/payment aggregate to REFUNDED. No external transfer occurs. Refunds do not automatically restock products; physical returns are not implemented.
- No schema migration or new dependency was required: payment attempts, verifier and status history already exist in the schema.

## Seller fulfillment and tracking (T016)

- Item states advance CONFIRMED → PROCESSING → SHIPPED → DELIVERED, one step per request. CONFIRMED is the initial fulfillment marker even while a prepaid order awaits payment; the order/payment gates prevent early processing.
- Sellers see only their own item snapshots and subtotal, plus delivery contact/address information needed to fulfill them. Approved store ownership is rechecked under locks for writes. Deleted products remain fulfillable through snapshots.
- Whole-order fulfillment follows the least-advanced item. Each item mutation appends a timestamped JSON history event; aggregate changes use the existing transition map and order status history. Legacy whole-order controls advance lagging items without regressing advanced items.
- Any item entering processing blocks whole-order buyer cancellation. Prepaid fulfillment requires a verified payment record. COD delivery is a manual item cash-collection acknowledgement; one full-order verified collection is recorded after all items arrive. Per-seller settlements and partial refunds remain out of scope.
- Buyer details show item and order timelines, poll every 15 seconds, and offer manual refresh. This is polling, not push delivery tracking. Existing migrated items retain their current status without fabricated historical timestamps.
- The seller board includes lifetime order count, delivered item sales and active item value. Money totals exclude delivery fees and cancelled/refunded orders; these are not payout or accounting reports.
- Store payment instructions support public KBZPay, WavePay and bank-transfer receiving details. Blank fields fall back to marketplace configuration; mixed-store orders always use marketplace instructions and admin payment review. One-store-per-seller management follows the existing store workflow.

## Engineering constraints

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
