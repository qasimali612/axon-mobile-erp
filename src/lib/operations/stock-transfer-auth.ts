import "server-only";

import { ApiError } from "@/lib/api";
import { permittedDocumentScopes, requireAuth } from "@/lib/auth";

export type TransferScope = {
  sourceBranchId: string;
  sourceWarehouseId: string;
  destinationBranchId: string;
  destinationWarehouseId: string;
};

function matches(scope: { branchId?: string; warehouseId?: string }, branchId: string, warehouseId: string) {
  if (scope.branchId && scope.branchId !== branchId) return false;
  if (scope.warehouseId && scope.warehouseId !== warehouseId) return false;
  return true;
}

/**
 * Viewing is allowed from either participating side. Mutations require the
 * permission in both source and destination scope so a warehouse-scoped role
 * cannot move stock into or out of an unauthorized warehouse.
 */
export async function requireStockTransferScope(
  permission: string,
  transfer: TransferScope,
  mode: "either" | "both" = "both",
) {
  const context = await requireAuth();
  const scopes = permittedDocumentScopes(context, permission);
  if (scopes === null) return context;
  const source = scopes.some((scope) => matches(scope, transfer.sourceBranchId, transfer.sourceWarehouseId));
  const destination = scopes.some((scope) => matches(scope, transfer.destinationBranchId, transfer.destinationWarehouseId));
  if (mode === "either" ? !source && !destination : !source || !destination) {
    throw new ApiError(403, "TRANSFER_SCOPE_FORBIDDEN", mode === "both"
      ? "Permission is required in both the source and destination warehouse."
      : "You do not have access to either side of this stock transfer.");
  }
  return context;
}
