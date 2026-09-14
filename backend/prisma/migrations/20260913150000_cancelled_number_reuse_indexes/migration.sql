-- Allow cancelled vouchers/invoices to stop reserving sequence numbers.
-- SQLite partial unique indexes enforce uniqueness only for surviving rows.

DROP INDEX IF EXISTS "Voucher_financialYearId_type_number_key";
DROP INDEX IF EXISTS "Invoice_reference_key";
DROP INDEX IF EXISTS "Invoice_type_number_key";

CREATE UNIQUE INDEX "Voucher_financialYearId_type_number_active_key"
ON "Voucher"("financialYearId", "type", "number")
WHERE "status" != 'CANCELLED';

CREATE UNIQUE INDEX "Invoice_reference_active_key"
ON "Invoice"("reference")
WHERE "status" != 'CANCELLED';

CREATE UNIQUE INDEX "Invoice_type_number_active_key"
ON "Invoice"("type", "number")
WHERE "status" != 'CANCELLED';
