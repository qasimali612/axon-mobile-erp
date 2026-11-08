-- Additional tenant and hierarchy guards for relationships where Prisma cannot
-- express a composite foreign key without duplicating public identifiers.

CREATE OR REPLACE FUNCTION enforce_product_reference_scope()
RETURNS TRIGGER AS $$
DECLARE category_company uuid;
DECLARE brand_company uuid;
DECLARE unit_company uuid;
BEGIN
  SELECT "companyId" INTO category_company FROM "ProductCategory" WHERE id = NEW."categoryId";
  SELECT "companyId" INTO unit_company FROM "UnitOfMeasure" WHERE id = NEW."unitId";
  IF NEW."brandId" IS NOT NULL THEN
    SELECT "companyId" INTO brand_company FROM "Brand" WHERE id = NEW."brandId";
  ELSE
    brand_company := NEW."companyId";
  END IF;
  IF category_company IS NULL OR unit_company IS NULL OR brand_company IS NULL
     OR category_company <> NEW."companyId"
     OR unit_company <> NEW."companyId"
     OR brand_company <> NEW."companyId" THEN
    RAISE EXCEPTION 'Cross-company Product reference rejected' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Product_company_scope"
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION enforce_product_reference_scope();

CREATE OR REPLACE FUNCTION enforce_user_role_scope()
RETURNS TRIGGER AS $$
DECLARE membership_company uuid;
DECLARE role_company uuid;
DECLARE branch_company uuid;
DECLARE warehouse_company uuid;
DECLARE warehouse_branch uuid;
BEGIN
  SELECT "companyId" INTO membership_company FROM "CompanyMembership" WHERE id = NEW."membershipId";
  SELECT "companyId" INTO role_company FROM "Role" WHERE id = NEW."roleId";
  IF membership_company IS NULL OR role_company IS NULL OR membership_company <> role_company THEN
    RAISE EXCEPTION 'UserRole membership and role companies differ' USING ERRCODE = '23514';
  END IF;
  IF NEW."branchId" IS NOT NULL THEN
    SELECT "companyId" INTO branch_company FROM "Branch" WHERE id = NEW."branchId";
    IF branch_company IS NULL OR branch_company <> membership_company THEN
      RAISE EXCEPTION 'UserRole branch is outside membership company' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."warehouseId" IS NOT NULL THEN
    SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch
    FROM "Warehouse" WHERE id = NEW."warehouseId";
    IF warehouse_company IS NULL OR warehouse_company <> membership_company THEN
      RAISE EXCEPTION 'UserRole warehouse is outside membership company' USING ERRCODE = '23514';
    END IF;
    IF NEW."branchId" IS NOT NULL AND warehouse_branch <> NEW."branchId" THEN
      RAISE EXCEPTION 'UserRole warehouse is outside selected branch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserRole_company_scope"
BEFORE INSERT OR UPDATE ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION enforce_user_role_scope();

CREATE OR REPLACE FUNCTION enforce_location_hierarchy()
RETURNS TRIGGER AS $$
DECLARE parent_warehouse uuid;
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    SELECT "warehouseId" INTO parent_warehouse FROM "WarehouseLocation" WHERE id = NEW."parentId";
    IF parent_warehouse IS NULL OR parent_warehouse <> NEW."warehouseId" THEN
      RAISE EXCEPTION 'WarehouseLocation parent belongs to another warehouse' USING ERRCODE = '23514';
    END IF;
    IF NEW."parentId" = NEW.id THEN
      RAISE EXCEPTION 'WarehouseLocation cannot parent itself' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WarehouseLocation_hierarchy"
BEFORE INSERT OR UPDATE ON "WarehouseLocation"
FOR EACH ROW EXECUTE FUNCTION enforce_location_hierarchy();

CREATE OR REPLACE FUNCTION enforce_barcode_variant_scope()
RETURNS TRIGGER AS $$
DECLARE variant_product uuid;
DECLARE variant_company uuid;
BEGIN
  IF NEW."variantId" IS NOT NULL THEN
    SELECT "productId", "companyId" INTO variant_product, variant_company
    FROM "ProductVariant" WHERE id = NEW."variantId";
    IF variant_product IS NULL OR variant_product <> NEW."productId" OR variant_company <> NEW."companyId" THEN
      RAISE EXCEPTION 'ProductBarcode variant does not belong to product/company' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProductBarcode_variant_scope"
BEFORE INSERT OR UPDATE ON "ProductBarcode"
FOR EACH ROW EXECUTE FUNCTION enforce_barcode_variant_scope();

CREATE OR REPLACE FUNCTION enforce_session_scope()
RETURNS TRIGGER AS $$
DECLARE membership_exists boolean;
DECLARE branch_company uuid;
DECLARE warehouse_company uuid;
DECLARE warehouse_branch uuid;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM "CompanyMembership"
    WHERE "userId" = NEW."userId" AND "companyId" = NEW."activeCompanyId" AND status = 'ACTIVE'
  ) INTO membership_exists;
  IF NOT membership_exists THEN
    RAISE EXCEPTION 'Session company has no active membership' USING ERRCODE = '23514';
  END IF;
  IF NEW."activeBranchId" IS NOT NULL THEN
    SELECT "companyId" INTO branch_company FROM "Branch" WHERE id = NEW."activeBranchId";
    IF branch_company IS NULL OR branch_company <> NEW."activeCompanyId" THEN
      RAISE EXCEPTION 'Session branch is outside active company' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."activeWarehouseId" IS NOT NULL THEN
    SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch
    FROM "Warehouse" WHERE id = NEW."activeWarehouseId";
    IF warehouse_company IS NULL OR warehouse_company <> NEW."activeCompanyId" THEN
      RAISE EXCEPTION 'Session warehouse is outside active company' USING ERRCODE = '23514';
    END IF;
    IF NEW."activeBranchId" IS NOT NULL AND warehouse_branch <> NEW."activeBranchId" THEN
      RAISE EXCEPTION 'Session warehouse is outside active branch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Session_company_scope"
BEFORE INSERT OR UPDATE OF "activeCompanyId", "activeBranchId", "activeWarehouseId", "userId" ON "Session"
FOR EACH ROW EXECUTE FUNCTION enforce_session_scope();
