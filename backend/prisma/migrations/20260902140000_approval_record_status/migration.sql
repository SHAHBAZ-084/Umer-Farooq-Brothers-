-- Approval workflow schema (Phase 1): RecordStatus on Account/Product, pending opening balance, createdById.

-- Account approval fields
ALTER TABLE "Account" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Account" ADD COLUMN "pendingOpeningBalance" DECIMAL;
ALTER TABLE "Account" ADD COLUMN "pendingOpeningBalanceSide" TEXT;
ALTER TABLE "Account" ADD COLUMN "createdById" INTEGER;

CREATE INDEX "Account_status_idx" ON "Account"("status");
CREATE INDEX "Account_createdById_idx" ON "Account"("createdById");

-- Existing rows were already live before approvals — keep them ACTIVE.
UPDATE "Account" SET "status" = 'ACTIVE';

-- Product approval fields
ALTER TABLE "Product" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Product" ADD COLUMN "createdById" INTEGER;

CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");

UPDATE "Product" SET "status" = 'ACTIVE';

-- Backfill creator as bootstrap admin where known (optional FK).
UPDATE "Account"
SET "createdById" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "id" ASC LIMIT 1)
WHERE "createdById" IS NULL;

UPDATE "Product"
SET "createdById" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "id" ASC LIMIT 1)
WHERE "createdById" IS NULL;

-- VoucherStatus / InvoiceStatus new values (PENDING_APPROVAL, REJECTED) are application-level;
-- existing voucher rows remain ACTIVE; invoice rows remain DRAFT/POSTED/CANCELLED.
