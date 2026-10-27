# Database and API Specification

## Core Database Tables

- `users`: id, name, email, phone, password_hash, role, status, created_at
- `addresses`: id, user_id, recipient_name, phone, region, city, address, notes
- `stores`: id, owner_id, name, slug, description, logo_url, status, payment_instructions (JSON object)
- `categories`: id, name, slug, parent_id, status
- `products`: id, store_id, category_id, name, slug, description, price, stock, status
- `product_images`: id, product_id, image_url, sort_order
- `carts`: id, user_id, created_at
- `cart_items`: id, cart_id, product_id, quantity
- `orders`: id, order_number, buyer_id, address_snapshot, subtotal, delivery_fee, total, payment_method, payment_status, status, created_at
- `order_items`: id, order_id, store_id, product_id, product_name, unit_price, quantity, subtotal, fulfillment_status, fulfillment_history (JSON array)
- `payments`: id, order_id, method, amount, transaction_reference, receipt_url, status, verified_by, created_at
- `order_status_history`: id, order_id, old_status, new_status, changed_by, created_at

Use UUID primary keys, foreign keys, timestamps, appropriate indexes, and decimal or integer-safe monetary representation. Use MMK consistently.

## Important Relationships
- A user can own a store.
- A store has many products.
- A buyer has many orders.
- An order has many order items.
- Each order item belongs to a seller's store.
- An order can have multiple payment records or payment attempts.

## Multi-Seller Checkout
One checkout may contain products from multiple sellers. Create one customer-facing order with separate seller order groups or equivalent seller-specific fulfillment records.

Each seller can manage only their own fulfillment items. The buyer sees the combined order.

## REST API

### Authentication
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/auth/me`

### Products
- GET `/api/products`
- GET `/api/products/:id`
- GET `/api/categories`
- GET `/api/stores/:slug`

### Seller
- POST `/api/seller/apply`
- GET `/api/seller/products`
- POST `/api/seller/products`
- PATCH `/api/seller/products/:id`
- DELETE `/api/seller/products/:id`
- GET `/api/seller/orders`
- PATCH `/api/seller/orders/:id/status`
- GET `/api/seller/sales-summary`
- GET `/api/seller/payment-instructions`
- PATCH `/api/seller/payment-instructions`

Seller order lists are paginated (`page`, `pageSize`) and include only owned item snapshots, owned subtotal, order/payment status and delivery details. Status PATCH accepts `{ itemId, status }`, with exactly one forward step through CONFIRMED → PROCESSING → SHIPPED → DELIVERED. Foreign order/items return 404; invalid transitions, unpaid prepaid orders and terminal orders return 409; unapproved stores return 403. Every mutation holds the order row lock and rechecks store approval under its row lock.

The combined order follows its least-advanced item. Item updates append timestamped fulfillment history; aggregate status changes write one order history row. Buyer cancellation is blocked after any item starts processing. Delivering COD items acknowledges cash collection; the final delivered item records one full-order collection. Existing whole-order status controls update lagging item states without regressions.

Sales summary returns lifetime `orderCount`, `deliveredSubtotal`, and `activeSubtotal`. Item money totals exclude delivery fees and cancelled/refunded orders. The order count includes all statuses. These are sales/activity figures, not payouts.

Payment instructions GET/PATCH returns/accepts `{ KBZPAY, WAVEPAY, BANK_TRANSFER }`, each a public receiving-instructions string of at most 2000 characters. Unknown fields are rejected. Only the authenticated seller's store is editable. Single-store orders use nonblank store overrides; blank fields and mixed-store orders use marketplace configuration. Never submit PINs or passwords.

Buyer order responses add `statusHistory` and item `fulfillmentStatus`/`fulfillmentHistory`, with `{ status, createdAt }` timeline entries. The buyer detail UI polls every 15 seconds and supports manual refresh. Migrated historical items retain current fulfillment status; no historical item events are fabricated.

### Cart and Orders
- GET `/api/checkout` — authenticated cart quote with server delivery fee and combined total.
- GET `/api/cart`
- POST `/api/cart/items`
- PATCH `/api/cart/items/:id`
- DELETE `/api/cart/items/:id`
- POST `/api/orders`
- GET `/api/orders`
- GET `/api/orders/:id`
- POST `/api/orders/:id/payments`
- POST `/api/orders/:id/cancel`

Buyer order responses include `canCancel`. Cancellation is owner-only, applies to the whole order, and requires unpaid COD in `CONFIRMED` or unpaid manual transfer in `PENDING_PAYMENT`; submitted/verified/refunded payment attempts block cancellation. Eligible cancellation restores remaining product inventory, updates the order to `CANCELLED`, and records status history atomically. Repeated/concurrent cancellation returns 409 after the first success without restoring stock twice. Foreign or missing orders return 404. Future payment/status writers must acquire the same order-row lock before checking and changing state.

Checkout creates an order from the authenticated user's current cart. The request contains `address` (`recipientName`, `phone`, `region`, `city`, `address`, optional `notes`) and `paymentMethod` (`COD`, `KBZPAY`, `WAVEPAY`, `BANK_TRANSFER`). Client prices, totals and item lists are ignored. The response includes purchase-time item snapshots grouped in `sellerGroups`, per-seller subtotals, the combined subtotal, delivery fee and total. The flat fee is configured by `DELIVERY_FEE_MMK` (default 0 MMK).

Order list/detail routes return only orders belonging to the authenticated buyer. Lists use `page` and `pageSize`. Successful checkout clears purchased cart items; any validation, availability or stock failure leaves both inventory and cart unchanged. COD starts `CONFIRMED` with payment `PENDING`; prepaid orders start `PENDING_PAYMENT` pending later payment submission/verification.

### Admin
- GET `/api/admin/sellers`
- PATCH `/api/admin/sellers/:id/status`
- GET `/api/admin/products`
- GET `/api/admin/orders`
- GET `/api/admin/payments`

## Security
- Verify ownership and role for every protected operation.
- Recalculate prices and totals on the server.
- Prevent overselling with transactional stock checks.
- Validate uploaded file type and size.
- Rate-limit authentication and sensitive endpoints.
- Record payment verification and administrative actions.
- Never expose passwords, secrets, or private receipt URLs publicly.
