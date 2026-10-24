# Architecture and Tech Stack

## Stack
- Frontend: React, TypeScript, Vite.
- UI: Tailwind CSS and shadcn/ui.
- Backend: Node.js, Express, TypeScript.
- Database: PostgreSQL.
- ORM: Prisma.
- Validation: Zod.
- Authentication: Secure session or JWT-based authentication.
- Image storage: local server file storage
- API: REST.

## Architecture
Use a modular monolith. Keep frontend and backend separate, but maintain one backend application and one primary database.

## Backend Modules
- Auth and Users
- Sellers and Stores
- Products and Categories
- Cart and Checkout
- Orders and Inventory
- Payments and Payment Verification
- Admin and Moderation
- Notifications

## Project Structure

    myanmart/
    ├── apps/
    │   ├── web/
    │   │   └── src/
    │   │       ├── components/
    │   │       ├── features/
    │   │       ├── pages/
    │   │       ├── hooks/
    │   │       └── lib/
    │   └── api/
    │       ├── prisma/
    │       │   └── schema.prisma
    │       └── src/
    │           ├── modules/
    │           ├── middleware/
    │           ├── lib/
    │           └── app.ts
    ├── packages/
    │   └── shared/
    ├── docs/
    └── README.md

## Engineering Rules
- Keep controllers thin.
- Put business logic in services.
- Use repositories only when they improve separation or testability.
- Validate request data using Zod.
- Use database transactions for checkout, inventory, and order creation.
- Enforce authorization on the backend.
- Store secrets in environment variables.
- Use pagination for product, seller, and order lists.
- Standardize API errors and responses.
- Never trust prices, roles, stock, or seller IDs supplied by the client.
