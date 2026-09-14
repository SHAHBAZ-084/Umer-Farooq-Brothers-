-- Business letterhead fields on SystemPreference (singleton id=1).
ALTER TABLE "SystemPreference" ADD COLUMN "businessName" TEXT NOT NULL DEFAULT 'Umer Farooq & Brothers';
ALTER TABLE "SystemPreference" ADD COLUMN "proprietorName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemPreference" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemPreference" ADD COLUMN "mobile" TEXT;
ALTER TABLE "SystemPreference" ADD COLUMN "email" TEXT;
ALTER TABLE "SystemPreference" ADD COLUMN "ntnNumber" TEXT;
