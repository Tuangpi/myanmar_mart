# MyanMart — Progress

## Current State

- **Current task:** None.
- **Most recently completed:** T008 — Seller application and admin approval.
- **Unfinished work:** T009–T020 in `TASKS.md`.
- **Blockers:** None.
- **Recommended next task:** T009 — Seller product and inventory management.

### Verified environment

Checked 2026-10-22:

- Node.js v24.21.0, npm 11.19.0, npm registry reachable.
- PostgreSQL 18.6 running locally on port 5432; `psql -U postgres` connects without a password (local trust auth). No Docker. No pnpm, yarn, or bun installed.
- Git: one commit (`first commit`). `README.md` has uncommitted modifications and `docs/` is untracked — both are the user's own work and were left untouched.

### Untracked / uncommitted

- `README.md` — modified by the user.
- `docs/` — untracked (ARCHITECTURE, DATABASE_API, IMPLEMENTATION, PROJECT, REQUIREMENTS).
- `PROJECT.md`, `TASKS.md`, `PROGRESS.md` — new tracking files.
- Entire `apps/`, `packages/`, and root scaffold — new, uncommitted.

## Task notes

### T001 — Monorepo scaffold and toolchain (DONE)

- **Result:** npm-workspaces monorepo created: `apps/api` (Express 5 + TypeScript, `tsx` dev / `tsc` build), `apps/web` (Vite 7 + React 19 + Tailwind CSS 4), `packages/shared` (Zod schemas, constants, shared types). Root TypeScript project references, ESLint 9 flat config, Prettier config, `.gitignore`, and a `.env.example` for the API. API exposes `GET /api/health` behind a standardized `{ success, data }` / `{ success, error }` envelope with a central error handler.
- **Files changed:** root `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`; `packages/shared/{package.json,tsconfig.json,src/*}`; `apps/api/{package.json,tsconfig.json,tsconfig.test.json,vitest.config.ts,.env.example,src/*}`; `apps/web/{package.json,tsconfig.json,tsconfig.app.json,tsconfig.node.json,vite.config.ts,vitest.config.ts,index.html,src/*}`.
- **Decisions:** TypeScript 5.9 rather than 7.0 (`typescript-eslint` 8.x requires `<6.1.0`). Vite 7 rather than 8 (stable peer support with `@vitejs/plugin-react` 5). Vitest 5 rather than 3 — Vitest 3 pulls a vulnerable `tinypool` with a critical prototype-pollution/RCE advisory. API built with plain `tsc` (no bundler) so `dist/` runs directly on Node ESM. `packages/shared` compiles to `dist/` and is consumed via the workspace symlink; the root `predev` script builds it first. Web dev server proxies `/api` to `http://localhost:4000`.
- **Checks run:** `npm install` (0 vulnerabilities, 350 packages). `npm run build` — shared, api, and web all succeed. `npm run typecheck` — passes across all three workspaces. `npm run lint` — 0 errors, 0 warnings. `npm test` — API 2 tests pass (health 200, 404 envelope), web 1 test passes (App renders). Live servers: API booted via `npm run dev:api` and returned HTTP 200 with the correct JSON body on `/api/health`; web booted via `npm run dev:web` and served the app with the `/api` proxy returning the health payload. Both servers stopped afterward.
- **Follow-up:** npm warned that `esbuild`'s postinstall script was not approved under npm 11's `allowScripts` gate. Builds and dev servers still work, so no approval was needed. Revisit if a tool needs esbuild's native binary. Prettier ignores `docs/` and `README.md` so the author's original formatting is not rewritten by `npm run format`.
- **Extra verification:** A clean rebuild (all `dist/` and `.tsbuildinfo` removed) succeeds, and the compiled API runs directly on Node ESM via `node dist/index.js`, returning HTTP 200 on `/api/health`. All dev servers were stopped afterward.

### T003 — Authentication and role-based access control (DONE)

- **Result:** Full auth module implemented: register, login, logout, `/me` with role check middleware (`requireAuth`, `requireRole`), httpOnly JWT cookie, bcryptjs password hashing, Prisma database wrapper. Typecheck PASS, 10/10 tests PASS, build PASS, E2E curl verified (register 200, login 200, /me 200, admin 403, no-token 401, wrong-password 401).
- **Files changed:** `src/lib/jwt.ts`, `src/lib/password.ts`, `src/lib/prisma.ts`, `src/middleware/auth.ts`, `src/modules/auth/auth.controller.ts`, `src/modules/auth/auth.routes.ts`, `src/modules/auth/auth.module.ts`, `src/modules/auth/auth.test.ts`, `src/config/env.ts`, `src/app.ts`, `apps/api/package.json`, `apps/api/prisma/schema.prisma`.
- **Decisions:** `dotenv/config` added to `env.ts` so `.env` loads in test environment. `ProductStatus` enum fixed to `DRAFT/ACTIVE/ARCHIVED` to align with shared constants. JWT stored in httpOnly cookie (sameSite lax). `storeId`/`store` shape replaced with `stores` relation query (approved stores only).
- **Checks run:** `npx tsc --noEmit` (PASS), `npm run test --workspace=@myanmart/api` (10/10 PASS), `npm run build --workspace=@myanmart/api` (PASS), manual curl E2E on `:4000` (register, login, /me, admin-403, no-token-401, wrong-password-401 all PASS).
- **Follow-up:** None — T003 complete.


### T004 — Application shell, layout, and i18n (DONE)
- **Status:** DONE
- **Expected result:** Responsive mobile-first layout with Tailwind CSS and shadcn-style UI primitives; Burmese (`my`) and English (`en`) language support with a language switcher and persisted choice; global UI primitives in `packages/shared` where reusable; English + Burmese visible UI text.
- **Completion check:** App renders at mobile and desktop widths; switching language updates visible UI text and the choice survives a page reload.
- **Dependencies:** T001

### T005 — Public catalog API (DONE)

- **Result:** Public catalog API implemented in `apps/api/src/modules/catalog/`: `GET /api/categories`, `GET /api/products` (search, filter by category/store, sort, pagination), `GET /api/products/:id` (UUID or slug), `GET /api/stores/:slug`. Zod validation via shared schemas; server-side pagination; only ACTIVE products in APPROVED stores are public.
- **Files changed:** `apps/api/src/modules/catalog/{catalog.controller.ts,catalog.routes.ts,catalog.module.ts,catalog.test.ts}`; `packages/shared/src/{schemas.ts,types.ts}`; `apps/api/src/app.ts`.
- **Checks run:** `npm test --workspace=@myanmart/api` — 27/27 PASS (catalog 17, auth 8, app 2). `npm run typecheck` PASS. `npm run build` PASS. (Lint has pre-existing warnings plus one error in `packages/shared/src/i18n/test.mjs` unrelated to T005.)
- **Follow-up:** None.

### T006 — Buyer catalog browsing UI (DONE)

- **Result:** Catalog page now loads categories and products from the public catalog API with search (debounced), category filter, sort field/order, and server-side pagination. Product cards show thumbnail, name, price (MMK), store, category, and stock state. Fixed the i18n provider so translations load on first render and the layout no longer calls hooks outside the provider.
- **Files changed:** `apps/web/src/pages/CatalogPage.tsx`; `apps/web/src/App.tsx`; `apps/web/src/layouts/I18nLayout.tsx`; `packages/shared/src/i18n/context.tsx`; `packages/shared/src/i18n/en.json`; `packages/shared/src/i18n/my.json`; `packages/shared/src/i18n/test.mjs`.
- **Checks run:** Resumption verification: web tests 5/5 PASS, including API-backed rendering, category filtering, pagination reset, debounced search, sorting, empty/error states, and persisted language switching (`apps/web/src/pages/CatalogPage.test.tsx`). `npm run typecheck` PASS; `npm run build` PASS across shared, API, and web; `npm run lint` reports 0 errors and 7 existing warnings. `git diff --check` PASS. Browser/live-API UI verification was not performed.
- **Follow-up:** Default parallel API test run failed 8/27 tests because auth and catalog fixtures delete shared database rows. Running `npm test --workspace=@myanmart/api -- --no-file-parallelism` passes 27/27. Test database isolation remains follow-up work; no API tests or configuration changed here. Product detail page (T007) can link from catalog cards. T007 edits appeared during resumption and were left untouched.

### T007 — Product detail page (DONE)

- **Result:** Product detail page now renders inside `I18nLayout` via an inner content component (fixing `useI18n` provider error). Shows images, price, stock, description, category, and seller link to `#/stores/:slug`; displays out-of-stock state when stock is zero.
- **Files changed:** `apps/web/src/pages/ProductDetailPage.tsx`; `apps/web/src/pages/ProductDetailPage.smoke.test.tsx`.
- **Checks run:** web tests 7/7 PASS; typecheck PASS; lint PASS (0 errors, 8 warnings); build PASS.
- **Follow-up:** Seller storefront page itself (T010) is not implemented yet, so the store link targets a future route.

### T008 — Seller application and admin approval (DONE)

- **Result:** Seller store application and admin approval workflow implemented. `POST /api/seller/apply` creates a PENDING store for an authenticated user and promotes them to SELLER; `GET /api/seller/store` surfaces store status to the applicant; `GET /api/admin/sellers` and `PATCH /api/admin/sellers/:id/status` let admins approve/reject/suspend stores (id may be store or owner id). Store status gates public catalog visibility and is intended to gate product publishing in T009.
- **Files changed:** `packages/shared/src/schemas.ts`; `apps/api/src/modules/seller/*`; `apps/api/src/modules/admin/*`; `apps/api/src/app.ts`; `apps/api/src/modules/seller/seller.test.ts`; `apps/api/vitest.config.ts`.
- **Checks run:** API tests 36/36 PASS (seller 9, catalog 17, auth 8, app 2) with `fileParallelism: false`; typecheck PASS (API + web); lint PASS on changed files; build PASS (shared + API).
- **Follow-up:** T009 will implement seller product CRUD and enforce the approved-store gate on publish. T010 will make the store link resolve.

## Notes

- i18n layer, primitive components, layout, and shell integration test go here.
- Backend unchanged for this task.

