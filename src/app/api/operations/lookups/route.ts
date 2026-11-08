import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { permittedDocumentScopes, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requireAuth();
    const scopePermission = ["inventory.stock.view", "purchase.view", "sales.view", "PAYMENT_VIEW"].find((permission) => context.permissions.includes(permission));
    if (!scopePermission) throw new ApiError(403, "FORBIDDEN", "Operational lookup access is not granted.");
    const scopes = permittedDocumentScopes(context, scopePermission);
    const branchScopeIds = scopes ? [...new Set(scopes.flatMap((scope) => scope.branchId ? [scope.branchId] : []))] : null;
    const warehouseScopeIds = scopes ? [...new Set(scopes.flatMap((scope) => scope.warehouseId ? [scope.warehouseId] : []))] : null;
    const branchWideIds = scopes ? [...new Set(scopes.flatMap((scope) => scope.branchId && !scope.warehouseId ? [scope.branchId] : []))] : null;
    const branchWhere = scopes ? { OR: [
      { id: { in: branchScopeIds || [] } },
      { warehouses: { some: { id: { in: warehouseScopeIds || [] } } } },
    ] } : {};
    const warehouseWhere = scopes ? { OR: [
      { branchId: { in: branchWideIds || [] } },
      { id: { in: warehouseScopeIds || [] } },
    ] } : {};
    const documentScopeWhere = scopes ? { AND: [{ OR: scopes }] } : {};
    const visibleBranchIds = scopes
      ? (await prisma.branch.findMany({ where: { companyId: context.company.id, ...branchWhere }, select: { id: true } })).map((branch) => branch.id)
      : null;
    const canViewCost = context.permissions.includes("catalog.cost.view");
    const [branches, warehouses, products, taxRules, customers, suppliers, banks, cashAccounts, users, purchaseOrders, salesInvoices, purchaseReceipts] = await Promise.all([
      prisma.branch.findMany({ where: { companyId: context.company.id, isActive: true, ...branchWhere }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.warehouse.findMany({ where: { companyId: context.company.id, isActive: true, ...warehouseWhere }, select: { id: true, branchId: true, code: true, name: true, type: true, allowReceiving: true, allowDispatch: true }, orderBy: { code: "asc" } }),
      prisma.product.findMany({ where: { companyId: context.company.id, status: "ACTIVE" }, select: { id: true, sku: true, name: true, model: true, productType: true, trackingMethod: true, brand: { select: { name: true } }, unit: { select: { code: true, name: true, decimalPlaces: true } }, taxRule: { select: { id: true, code: true, name: true, rate: true } }, barcodes: { select: { barcode: true, type: true, isPrimary: true } }, variants: { where: { isActive: true }, select: { id: true, sku: true, name: true, color: true, storageGb: true, retailPrice: true, minimumSellingPrice: true, barcodes: { select: { barcode: true, type: true, isPrimary: true } }, ...(canViewCost ? { purchasePrice: true } : {}) }, orderBy: { sku: "asc" } } }, orderBy: { name: "asc" } }),
      prisma.taxRule.findMany({ where: { companyId: context.company.id, isActive: true }, select: { id: true, code: true, name: true, rate: true, appliesToPurchases: true, appliesToSales: true }, orderBy: { code: "asc" } }),
      prisma.customer.findMany({ where: { companyId: context.company.id, status: "ACTIVE", ...(visibleBranchIds ? { OR: [{ branchId: null }, { branchId: { in: visibleBranchIds } }] } : {}) }, select: { id: true, branchId: true, code: true, name: true, creditLimit: true, paymentTermsDays: true }, orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ where: { companyId: context.company.id, status: "ACTIVE", ...(visibleBranchIds ? { OR: [{ branchId: null }, { branchId: { in: visibleBranchIds } }] } : {}) }, select: { id: true, code: true, name: true, paymentTermsDays: true }, orderBy: { name: "asc" } }),
      prisma.bankAccount.findMany({ where: { companyId: context.company.id, isActive: true, ...(visibleBranchIds ? { branchId: { in: visibleBranchIds } } : {}) }, select: { id: true, branchId: true, code: true, bankName: true, currencyCode: true }, orderBy: { code: "asc" } }),
      prisma.account.findMany({ where: { companyId: context.company.id, isActive: true, accountType: "CASH", ...(visibleBranchIds ? { OR: [{ branchId: null }, { branchId: { in: visibleBranchIds } }] } : {}) }, select: { id: true, branchId: true, code: true, name: true, currencyCode: true }, orderBy: { code: "asc" } }),
      prisma.companyMembership.findMany({ where: { companyId: context.company.id, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { user: { select: { id: true, fullName: true } } }, orderBy: { user: { fullName: "asc" } } }),
      prisma.purchaseOrder.findMany({ where: { companyId: context.company.id, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] }, ...documentScopeWhere }, select: { id: true, branchId: true, warehouseId: true, supplierId: true, orderNumber: true, status: true, currencyCode: true, lines: { select: { id: true, productId: true, variantId: true, taxRuleId: true, description: true, orderedQuantity: true, receivedQuantity: true, unitCost: true, discountAmount: true, taxRate: true, taxAmount: true } } }, orderBy: { orderDate: "desc" }, take: 100 }),
      prisma.salesInvoice.findMany({ where: { companyId: context.company.id, status: "POSTED", reversalOfId: null, ...documentScopeWhere }, select: { id: true, branchId: true, customerId: true, invoiceNumber: true, invoiceDate: true, grandTotal: true }, orderBy: { invoiceDate: "desc" }, take: 200 }),
      prisma.purchaseReceipt.findMany({ where: { companyId: context.company.id, status: "POSTED", ...documentScopeWhere }, select: { id: true, branchId: true, supplierId: true, receiptNumber: true, receiptDate: true, grandTotal: true }, orderBy: { receiptDate: "desc" }, take: 200 }),
    ]);
    return NextResponse.json(jsonSafe({
      data: {
        branches,
        warehouses,
        products,
        taxRules,
        customers,
        suppliers,
        banks,
        cashAccounts,
        users: users.map((membership) => membership.user),
        purchaseOrders,
        salesInvoices,
        purchaseReceipts,
      },
    }));
  } catch (error) { return apiError(error); }
}
