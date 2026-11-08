-- Snapshot the configured tax rule and rate on each sales line. Client-supplied
-- tax totals are no longer authoritative; sales services recalculate them.
ALTER TABLE "SalesInvoiceLine"
  ADD COLUMN "taxRuleId" UUID,
  ADD COLUMN "taxRate" DECIMAL(9,4) NOT NULL DEFAULT 0;
CREATE INDEX "SalesInvoiceLine_taxRuleId_idx" ON "SalesInvoiceLine"("taxRuleId");
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesInvoiceLine" DROP CONSTRAINT "SalesInvoiceLine_valid_values";
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_valid_values" CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxRate" BETWEEN 0 AND 100 AND "taxAmount" >= 0
  AND "lineTotal" >= 0 AND "costTotal" >= 0
  AND "discountAmount" <= round("quantity" * "unitPrice", 4)
  AND "lineTotal" = round(("quantity" * "unitPrice") - "discountAmount" + "taxAmount", 4)
);

CREATE OR REPLACE FUNCTION enforce_sales_invoice_line_scope()
RETURNS trigger AS $$
DECLARE parent_company UUID; product_company UUID; variant_company UUID; variant_product UUID; tax_company UUID;
BEGIN
  SELECT "companyId" INTO parent_company FROM "SalesInvoice" WHERE "id" = NEW."invoiceId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF NEW."taxRuleId" IS NOT NULL THEN SELECT "companyId" INTO tax_company FROM "TaxRule" WHERE "id" = NEW."taxRuleId"; END IF;
  IF product_company IS DISTINCT FROM parent_company OR variant_company IS DISTINCT FROM parent_company
     OR variant_product IS DISTINCT FROM NEW."productId" OR (NEW."taxRuleId" IS NOT NULL AND tax_company IS DISTINCT FROM parent_company) THEN
    RAISE EXCEPTION 'Sales line product, variant, or tax rule is outside invoice scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
