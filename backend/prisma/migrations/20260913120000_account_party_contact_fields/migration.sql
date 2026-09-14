-- Optional party contact fields on Account (Sale / Purchase parties).
ALTER TABLE "Account" ADD COLUMN "phone" TEXT;
ALTER TABLE "Account" ADD COLUMN "address" TEXT;
ALTER TABLE "Account" ADD COLUMN "cnic" TEXT;
CREATE INDEX "Account_phone_idx" ON "Account"("phone");
CREATE INDEX "Account_cnic_idx" ON "Account"("cnic");
