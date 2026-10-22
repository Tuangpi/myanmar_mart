# Implementation Plan

Build the product incrementally. Finish and test each phase before moving to the next.

## Phase 1 — Foundation
- Initialize React and Express TypeScript applications.
- Configure PostgreSQL, Prisma, and migrations.
- Implement authentication and role-based authorization.
- Create responsive layouts and Burmese/English language support.

## Phase 2 — Marketplace
- Implement categories, product listings, search, and filters.
- Build product detail pages and seller storefronts.
- Implement seller applications and admin approval.
- Build seller product and inventory management.

## Phase 3 — Shopping
- Implement cart and checkout.
- Support delivery addresses and contact information.
- Create transactional order and inventory handling.
- Implement multi-seller order grouping.

## Phase 4 — Payments and Fulfillment
- Implement cash on delivery and manual payment submissions.
- Add receipt uploads and payment verification.
- Implement seller order management and buyer order tracking.
- Enforce valid order status transitions.

## Phase 5 — Administration
- Build admin dashboards and moderation tools.
- Add seller management and payment review.
- Add audit history and basic marketplace reports.

## Phase 6 — Testing and Deployment
- Add unit, API integration, and critical end-to-end tests.
- Test authorization across buyer, seller, and admin roles.
- Test concurrent purchases and stock consistency.
- Configure production environment variables, HTTPS, backups, logging, and error monitoring.
- Deploy frontend, API, database, and private file storage.

## Coding Agent Rules
- Read all files in `docs/` before implementation.
- Follow the documented product scope and architecture.
- Do not implement features outside the MVP without approval.
- Use small, verifiable implementation steps.
- Create database migrations and tests alongside features.
- Run type checks, linting, and tests after each phase.
- Never leave core workflows implemented only as mock data.
- Document setup instructions and required environment variables.
- Report completed work, test results, and remaining issues after each phase.

## Definition of Done
A feature is complete only when its UI, API, validation, authorization, database changes, error handling, and relevant tests are implemented and verified.
