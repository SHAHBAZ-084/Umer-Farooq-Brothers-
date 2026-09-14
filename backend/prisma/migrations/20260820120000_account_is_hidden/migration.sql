-- AlterTable
ALTER TABLE "Account" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Account_isHidden_idx" ON "Account"("isHidden");

-- Mark existing Opening Balance Equity control accounts as hidden
UPDATE "Account" SET "isHidden" = true WHERE "name" = 'Opening Balance Equity';
