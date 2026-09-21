-- AlterTable
ALTER TABLE "AccountCategory" ADD COLUMN "collectsContactInfo" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: party/customer categories that previously matched the name-based contact gate
UPDATE "AccountCategory"
SET "collectsContactInfo" = true
WHERE "name" IN (
  'Sale Party',
  'Int. Purchase Party',
  'Ext. Purchase Party',
  'Party / Customer'
);
