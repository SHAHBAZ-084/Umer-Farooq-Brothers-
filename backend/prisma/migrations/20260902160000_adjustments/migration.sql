-- Account and Stock adjustments (pending approval queue types 5 & 6)

CREATE TABLE "AccountAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "side" TEXT NOT NULL,
    "adjustmentDate" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "bagType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "bags" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "side" TEXT NOT NULL,
    "adjustmentDate" DATETIME NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountAdjustment_status_idx" ON "AccountAdjustment"("status");
CREATE INDEX "AccountAdjustment_accountId_idx" ON "AccountAdjustment"("accountId");
CREATE INDEX "AccountAdjustment_createdById_idx" ON "AccountAdjustment"("createdById");

CREATE INDEX "StockAdjustment_status_idx" ON "StockAdjustment"("status");
CREATE INDEX "StockAdjustment_productId_idx" ON "StockAdjustment"("productId");
CREATE INDEX "StockAdjustment_createdById_idx" ON "StockAdjustment"("createdById");

-- StockMovement: optional invoiceType + link to stock adjustment
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "bagType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "bags" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "invoiceId" INTEGER,
    "invoiceType" TEXT,
    "invoiceReference" TEXT NOT NULL,
    "description" TEXT,
    "stockAdjustmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("id", "productId", "bagType", "direction", "bags", "date", "invoiceId", "invoiceType", "invoiceReference", "description", "createdAt")
SELECT "id", "productId", "bagType", "direction", "bags", "date", "invoiceId", "invoiceType", "invoiceReference", "description", "createdAt" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_stockAdjustmentId_key" ON "StockMovement"("stockAdjustmentId");
CREATE INDEX "StockMovement_productId_bagType_date_id_idx" ON "StockMovement"("productId", "bagType", "date", "id");
CREATE INDEX "StockMovement_invoiceId_idx" ON "StockMovement"("invoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
