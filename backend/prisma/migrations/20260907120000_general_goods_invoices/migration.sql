-- General Goods invoices: ProductCategory, qty stock, purchase/sale lines, invoice party FKs.
-- Does NOT apply tax fields. Does NOT change grain StockMovement tables.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "stockMode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- Seed Grain category for existing products (GRAIN_BAGS)
INSERT INTO "ProductCategory" ("name", "stockMode", "isActive", "createdAt", "updatedAt")
VALUES ('Grain', 'GRAIN_BAGS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineProduct: add categoryId (NOT NULL) + averageCost
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unit" TEXT,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "averageCost" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Product" (
    "id", "name", "code", "unit", "accountId", "categoryId", "averageCost",
    "isActive", "status", "createdById", "createdAt", "updatedAt"
)
SELECT
    p."id", p."name", p."code", p."unit", p."accountId",
    (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Grain' LIMIT 1),
    NULL,
    p."isActive", p."status", p."createdById", p."createdAt", p."updatedAt"
FROM "Product" p;

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE UNIQUE INDEX "Product_accountId_key" ON "Product"("accountId");
CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- Invoice party accounts for general purchase/sale (keep existing columns, including kaatEnabled)
ALTER TABLE "Invoice" ADD COLUMN "partyAccountId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "salePartyAccountId" INTEGER;

-- CreateTable
CREATE TABLE "GeneralPurchaseLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "rate" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "mazduriAmount" DECIMAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GeneralPurchaseLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneralPurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GeneralPurchaseLine_invoiceId_idx" ON "GeneralPurchaseLine"("invoiceId");
CREATE INDEX "GeneralPurchaseLine_productId_idx" ON "GeneralPurchaseLine"("productId");

-- CreateTable
CREATE TABLE "GeneralSaleLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "rate" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GeneralSaleLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneralSaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GeneralSaleLine_invoiceId_idx" ON "GeneralSaleLine"("invoiceId");
CREATE INDEX "GeneralSaleLine_productId_idx" ON "GeneralSaleLine"("productId");

-- CreateTable
CREATE TABLE "ProductQuantityMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "invoiceId" INTEGER,
    "invoiceType" TEXT,
    "invoiceReference" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductQuantityMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductQuantityMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProductQuantityMovement_productId_date_id_idx" ON "ProductQuantityMovement"("productId", "date", "id");
CREATE INDEX "ProductQuantityMovement_invoiceId_idx" ON "ProductQuantityMovement"("invoiceId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
