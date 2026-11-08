-- Price list and payment method masters (normalized, company scoped).

ALTER TABLE "Customer" ADD COLUMN "priceListId" UUID;
ALTER TABLE "Payment" ADD COLUMN "paymentMethodId" UUID;
ALTER TABLE "SalesInvoice" ADD COLUMN "priceListId" UUID;

CREATE TABLE "PriceList" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "priceLevel" VARCHAR(40) NOT NULL DEFAULT 'RETAIL',
    "currencyCode" CHAR(3) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceList_window_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE TABLE "PriceListItem" (
    "id" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "price" DECIMAL(19,4) NOT NULL,
    "minimumPrice" DECIMAL(19,4),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceListItem_price_check" CHECK ("price" >= 0 AND ("minimumPrice" IS NULL OR ("minimumPrice" >= 0 AND "minimumPrice" <= "price")))
);

CREATE TABLE "PaymentMethod" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "methodType" VARCHAR(30) NOT NULL,
    "cashAccountId" UUID,
    "bankAccountId" UUID,
    "requiresReference" BOOLEAN NOT NULL DEFAULT false,
    "sequence" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentMethod_settlement_check" CHECK (
        ("methodType" = 'CASH' AND "cashAccountId" IS NOT NULL AND "bankAccountId" IS NULL)
        OR ("methodType" <> 'CASH' AND "bankAccountId" IS NOT NULL AND "cashAccountId" IS NULL)
    )
);

CREATE INDEX "PriceList_companyId_isActive_isDefault_idx" ON "PriceList"("companyId", "isActive", "isDefault");
CREATE UNIQUE INDEX "PriceList_companyId_code_key" ON "PriceList"("companyId", "code");
CREATE UNIQUE INDEX "PriceList_companyId_name_key" ON "PriceList"("companyId", "name");
CREATE UNIQUE INDEX "PriceList_companyId_default_key" ON "PriceList"("companyId") WHERE "isDefault" = true;

CREATE INDEX "PriceListItem_variantId_idx" ON "PriceListItem"("variantId");
CREATE UNIQUE INDEX "PriceListItem_priceListId_variantId_key" ON "PriceListItem"("priceListId", "variantId");

CREATE INDEX "PaymentMethod_companyId_isActive_sequence_idx" ON "PaymentMethod"("companyId", "isActive", "sequence");
CREATE UNIQUE INDEX "PaymentMethod_companyId_code_key" ON "PaymentMethod"("companyId", "code");
CREATE UNIQUE INDEX "PaymentMethod_companyId_name_key" ON "PaymentMethod"("companyId", "name");

CREATE INDEX "Customer_priceListId_idx" ON "Customer"("priceListId");
CREATE INDEX "Payment_paymentMethodId_idx" ON "Payment"("paymentMethodId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lifecycle and tenancy guards -------------------------------------------------

CREATE OR REPLACE FUNCTION pricing_payment_master_guard() RETURNS trigger AS $$
DECLARE
  company_id uuid;
  parent_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'PriceList' OR TG_TABLE_NAME = 'PaymentMethod' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Pricing and payment masters can only be deactivated, never deleted';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW."companyId" <> OLD."companyId" THEN
      RAISE EXCEPTION 'Pricing and payment master company may not change';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'PriceListItem' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    SELECT pl."companyId", v."companyId" INTO company_id, parent_company
    FROM "PriceList" pl JOIN "ProductVariant" v ON v."id" = NEW."variantId"
    WHERE pl."id" = NEW."priceListId";
    IF company_id IS DISTINCT FROM parent_company THEN
      RAISE EXCEPTION 'Price list item variant must belong to the price list company';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Payment' AND NEW."paymentMethodId" IS NOT NULL THEN
    SELECT pm."companyId" INTO parent_company FROM "PaymentMethod" pm WHERE pm."id" = NEW."paymentMethodId";
    IF parent_company IS DISTINCT FROM NEW."companyId" THEN
      RAISE EXCEPTION 'Payment method must belong to the payment company';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'Customer' AND NEW."priceListId" IS NOT NULL THEN
    SELECT pl."companyId" INTO parent_company FROM "PriceList" pl WHERE pl."id" = NEW."priceListId";
    IF parent_company IS DISTINCT FROM NEW."companyId" THEN
      RAISE EXCEPTION 'Customer price list must belong to the customer company';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PriceList_guard" BEFORE UPDATE OR DELETE ON "PriceList"
FOR EACH ROW EXECUTE FUNCTION pricing_payment_master_guard();
CREATE TRIGGER "PaymentMethod_guard" BEFORE UPDATE OR DELETE ON "PaymentMethod"
FOR EACH ROW EXECUTE FUNCTION pricing_payment_master_guard();
CREATE TRIGGER "PriceListItem_guard" BEFORE INSERT OR UPDATE ON "PriceListItem"
FOR EACH ROW EXECUTE FUNCTION pricing_payment_master_guard();
CREATE TRIGGER "Payment_method_company_guard" BEFORE INSERT OR UPDATE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION pricing_payment_master_guard();
CREATE TRIGGER "Customer_price_list_company_guard" BEFORE INSERT OR UPDATE ON "Customer"
FOR EACH ROW EXECUTE FUNCTION pricing_payment_master_guard();

-- Deactivation is blocked while active customers, open invoices, or drafts still rely on the list.
CREATE OR REPLACE FUNCTION price_list_usage_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."isActive" = false AND OLD."isActive" = true THEN
    IF EXISTS (SELECT 1 FROM "Customer" c WHERE c."priceListId" = NEW."id" AND c."status" = 'ACTIVE') THEN
      RAISE EXCEPTION 'Price list is assigned to active customers and cannot be deactivated';
    END IF;
    IF EXISTS (SELECT 1 FROM "SalesInvoice" si WHERE si."priceListId" = NEW."id" AND si."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED')) THEN
      RAISE EXCEPTION 'Price list is used by open sales invoices and cannot be deactivated';
    END IF;
  END IF;
  IF NEW."isDefault" = true AND NEW."isActive" = false THEN
    RAISE EXCEPTION 'The default price list must stay active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PriceList_usage_guard" BEFORE UPDATE ON "PriceList"
FOR EACH ROW EXECUTE FUNCTION price_list_usage_guard();

CREATE OR REPLACE FUNCTION payment_method_usage_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."isActive" = false AND OLD."isActive" = true THEN
    IF EXISTS (SELECT 1 FROM "Payment" p WHERE p."paymentMethodId" = NEW."id" AND p."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED')) THEN
      RAISE EXCEPTION 'Payment method is used by open payments and cannot be deactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentMethod_usage_guard" BEFORE UPDATE ON "PaymentMethod"
FOR EACH ROW EXECUTE FUNCTION payment_method_usage_guard();
