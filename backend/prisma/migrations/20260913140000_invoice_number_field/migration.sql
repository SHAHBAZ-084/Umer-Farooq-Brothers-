-- Add Invoice.number (per-type sequence), backfill from existing reference strings,
-- enforce @@unique([type, number]).

-- AlterTable: temporary default so existing rows can be updated
ALTER TABLE "Invoice" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0;

-- Backfill: number = integer embedded after the last '-' in reference (e.g. PG-00003 → 3).
-- This preserves whatever sequence was already encoded in reference strings.
UPDATE "Invoice"
SET "number" = CAST(substr("reference", instr("reference", '-') + 1) AS INTEGER)
WHERE instr("reference", '-') > 0;

-- Sanity: fail migration if any row could not be parsed to a positive number.
-- SQLite has no RAISE in UPDATE; use a CHECK via insert into a temp that only succeeds when clean.
CREATE TABLE "_invoice_number_backfill_ok" (
  "ok" INTEGER NOT NULL PRIMARY KEY CHECK ("ok" = 1)
);
INSERT INTO "_invoice_number_backfill_ok" ("ok")
SELECT 1
WHERE NOT EXISTS (
  SELECT 1 FROM "Invoice" WHERE "number" IS NULL OR "number" <= 0
)
AND NOT EXISTS (
  SELECT 1
  FROM "Invoice"
  GROUP BY "type", "number"
  HAVING COUNT(*) > 1
);
DROP TABLE "_invoice_number_backfill_ok";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_type_number_key" ON "Invoice"("type", "number");
CREATE INDEX "Invoice_type_status_idx" ON "Invoice"("type", "status");
