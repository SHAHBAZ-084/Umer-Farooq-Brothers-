-- CreateTable
CREATE TABLE "AppSecret" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
