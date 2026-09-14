-- CreateEnum
CREATE TABLE IF NOT EXISTS "Reminder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reminderAt" DATETIME NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" INTEGER NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "settledAt" DATETIME,
    "settledById" INTEGER,
    "lastNotifiedAt" DATETIME,
    "notifyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reminder_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Reminder_status_reminderAt_idx" ON "Reminder"("status", "reminderAt");
CREATE INDEX "Reminder_accountId_idx" ON "Reminder"("accountId");
CREATE INDEX "Reminder_createdById_idx" ON "Reminder"("createdById");
