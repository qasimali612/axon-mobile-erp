-- Allow removing unreferenced pricing/payment masters while keeping referenced masters protected.

CREATE OR REPLACE FUNCTION pricing_payment_master_guard() RETURNS trigger AS $$
DECLARE
  company_id uuid;
  parent_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'PriceList' THEN
    IF TG_OP = 'DELETE' THEN
      IF EXISTS (SELECT 1 FROM "Customer" c WHERE c."priceListId" = OLD."id")
         OR EXISTS (SELECT 1 FROM "SalesInvoice" si WHERE si."priceListId" = OLD."id") THEN
        RAISE EXCEPTION 'Price list is used by customers or invoices and can only be deactivated';
      END IF;
      RETURN OLD;
    END IF;
    IF NEW."companyId" <> OLD."companyId" THEN
      RAISE EXCEPTION 'Pricing and payment master company may not change';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'PaymentMethod' THEN
    IF TG_OP = 'DELETE' THEN
      IF EXISTS (SELECT 1 FROM "Payment" p WHERE p."paymentMethodId" = OLD."id") THEN
        RAISE EXCEPTION 'Payment method is used by payments and can only be deactivated';
      END IF;
      RETURN OLD;
    END IF;
    IF NEW."companyId" <> OLD."companyId" THEN
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
