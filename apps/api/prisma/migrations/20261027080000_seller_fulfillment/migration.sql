ALTER TABLE "stores" ADD COLUMN "payment_instructions" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "order_items" ADD COLUMN "fulfillment_status" TEXT NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN "fulfillment_history" JSONB NOT NULL DEFAULT '[]';

-- Preserve fulfillment already recorded through the whole-order transition API.
UPDATE "order_items" AS i SET "fulfillment_status" = o.status::text
FROM "orders" AS o WHERE i.order_id = o.id
AND o.status::text IN ('PROCESSING', 'SHIPPED', 'DELIVERED');