import { AssetWorkspace } from "@/components/finance/asset-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function FixedAssetsPage() {
  const context = await requirePagePermission("ASSET_VIEW");
  return <AssetWorkspace
    currency={context.company.currencyCode}
    currentUserId={context.user.id}
    permissions={{
      create: context.permissions.includes("ASSET_CREATE"),
      manageCategory: context.permissions.includes("ASSET_CATEGORY_MANAGE"),
      postDepreciation: context.permissions.includes("ASSET_DEPRECIATION_POST"),
      dispose: context.permissions.includes("ASSET_DISPOSAL_APPROVE"),
      export: context.permissions.includes("FINANCIAL_REPORTS_EXPORT"),
    }}
  />;
}
