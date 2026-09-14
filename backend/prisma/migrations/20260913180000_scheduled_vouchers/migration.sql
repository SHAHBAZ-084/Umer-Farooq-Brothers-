-- CreateTable
CREATE TABLE "ScheduledVoucher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherType" TEXT NOT NULL,
    "debitAccountId" INTEGER NOT NULL,
    "creditAccountId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME,
    "occurrenceLimit" INTEGER,
    "occurrencesRun" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledVoucher_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledVoucher_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledVoucher_status_nextRunAt_idx" ON "ScheduledVoucher"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledVoucher_createdById_idx" ON "ScheduledVoucher"("createdById");

-- CreateIndex
CREATE INDEX "ScheduledVoucher_debitAccountId_idx" ON "ScheduledVoucher"("debitAccountId");

-- CreateIndex
CREATE INDEX "ScheduledVoucher_creditAccountId_idx" ON "ScheduledVoucher"("creditAccountId");
