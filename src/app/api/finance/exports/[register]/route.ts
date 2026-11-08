import { Prisma } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ register: string }> };

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

const registers = {
  budgets: { permission: "BUDGET_VIEW", label: "Budget register", filename: "budget-register" },
  incentives: { permission: "INCENTIVE_VIEW", label: "Incentive register", filename: "incentive-register" },
  rebates: { permission: "REBATE_VIEW", label: "Rebate register", filename: "rebate-register" },
  assets: { permission: "ASSET_VIEW", label: "Fixed-asset register", filename: "fixed-asset-register" },
} as const;

type RegisterKey = keyof typeof registers;

/**
 * Audited CSV export of a finance register. Every register requires its module view permission plus
 * the financial export permission so cost and planning data never leaves the system unrecorded.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { register } = await params;
    const definition = registers[register as RegisterKey];
    if (!definition) throw new ApiError(404, "UNKNOWN_REGISTER", "This register cannot be exported.");
    const context = await requirePermission(definition.permission);
    await requirePermission("FINANCIAL_REPORTS_EXPORT");
    const companyId = context.company.id;
    const branches = permittedBranchIds(context, definition.permission);
    const branchScope = branches ? { in: branches } : undefined;

    let header: string[] = [];
    let body: Array<Array<unknown>> = [];

    if (register === "budgets") {
      const budgets = await prisma.budget.findMany({
        where: { companyId, ...(branchScope ? { OR: [{ branchId: null }, { branchId: branchScope }] } : {}) },
        include: { company: { select: { currencyCode: true } }, fiscalYear: { select: { code: true } }, branch: { select: { code: true } }, department: { select: { code: true } }, costCenter: { select: { code: true } }, createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, lines: { include: { account: { select: { code: true, name: true } }, period: { select: { name: true } } }, orderBy: [{ account: { code: "asc" } }, { period: { number: "asc" } }] } },
        orderBy: [{ code: "asc" }, { version: "desc" }],
      });
      header = ["Budget", "Version", "Status", "Fiscal year", "Branch", "Department", "Cost centre", "Currency", "Total", "Prepared by", "Approved by", "Account code", "Account", "Period", "Line amount", "Line notes"];
      body = budgets.flatMap((budget) => {
        const total = budget.lines.reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
        const base = [budget.code, budget.version, budget.status, budget.fiscalYear.code, budget.branch?.code ?? "Company", budget.department?.code ?? "", budget.costCenter?.code ?? "", budget.company.currencyCode, total.toFixed(4), budget.createdBy?.fullName ?? "", budget.approvedBy?.fullName ?? ""];
        return budget.lines.length
          ? budget.lines.map((line) => [...base, line.account.code, line.account.name, line.period.name, line.amount.toFixed(4), line.notes ?? ""])
          : [[...base, "", "", "", "", ""]];
      });
    } else if (register === "incentives") {
      const calculations = await prisma.incentiveCalculation.findMany({
        where: { companyId, ...(branchScope ? { branchId: branchScope } : {}) },
        include: { plan: { select: { code: true, incentiveType: true } }, branch: { select: { code: true } }, recipientUser: { select: { fullName: true } }, recipientCustomer: { select: { name: true } }, calculatedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, payable: { select: { voucherNumber: true, paidAmount: true, outstandingAmount: true, status: true } } },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      });
      header = ["Plan", "Rule", "Period start", "Period end", "Branch", "Recipient", "Recipient type", "Net sales", "Quantity", "Calculated", "Adjustment", "Approved", "Status", "Accrual voucher", "Paid", "Outstanding", "Calculated by", "Approved by"];
      body = calculations.map((row) => [row.plan.code, row.plan.incentiveType, row.periodStart, row.periodEnd, row.branch?.code ?? "", row.recipientUser?.fullName ?? row.recipientCustomer?.name ?? row.recipientName ?? "", row.recipientType, row.eligibleNetSales.toFixed(4), row.eligibleQuantity.toFixed(4), row.calculatedAmount.toFixed(4), row.adjustmentAmount.toFixed(4), row.approvedAmount.toFixed(4), row.status, row.payable?.voucherNumber ?? "", row.payable?.paidAmount.toFixed(4) ?? "0.0000", row.payable?.outstandingAmount.toFixed(4) ?? "0.0000", row.calculatedBy?.fullName ?? "", row.approvedBy?.fullName ?? ""]);
    } else if (register === "rebates") {
      const calculations = await prisma.rebateCalculation.findMany({
        where: { companyId },
        include: { program: { select: { code: true, direction: true, calculationMethod: true } }, supplier: { select: { name: true } }, customer: { select: { name: true } }, calculatedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      });
      header = ["Reference", "Program", "Direction", "Method", "Party", "Period start", "Period end", "Eligible value", "Eligible quantity", "Calculated", "Approved", "Settled", "Outstanding", "Status", "Calculated by", "Approved by"];
      body = calculations.map((row) => [row.referenceNumber, row.program.code, row.program.direction, row.program.calculationMethod, row.supplier?.name ?? row.customer?.name ?? "", row.periodStart, row.periodEnd, row.eligibleValue.toFixed(4), row.eligibleQuantity.toFixed(4), row.calculatedAmount.toFixed(4), row.approvedAmount.toFixed(4), row.settledAmount.toFixed(4), row.outstandingAmount.toFixed(4), row.status, row.calculatedBy?.fullName ?? "", row.approvedBy?.fullName ?? ""]);
    } else {
      const assets = await prisma.fixedAsset.findMany({
        where: { companyId, ...(branchScope ? { branchId: branchScope } : {}) },
        include: { category: { select: { code: true, name: true } }, branch: { select: { code: true } }, custodian: { select: { fullName: true } }, department: { select: { code: true } } },
        orderBy: [{ code: "asc" }],
      });
      header = ["Asset", "Name", "Category", "Branch", "Department", "Custodian", "Serial", "Purchase date", "Capitalization date", "Method", "Useful life (months)", "Purchase cost", "Additional cost", "Residual value", "Accumulated depreciation", "Net book value", "Status"];
      body = assets.map((asset) => [asset.code, asset.name, `${asset.category.code} · ${asset.category.name}`, asset.branch.code, asset.department?.code ?? "", asset.custodian?.fullName ?? "", asset.serialNumber ?? "", asset.purchaseDate, asset.capitalizationDate, asset.depreciationMethod, asset.usefulLifeMonths ?? "", asset.purchaseCost.toFixed(4), asset.additionalCost.toFixed(4), asset.residualValue.toFixed(4), asset.accumulatedDepreciation.toFixed(4), asset.netBookValue.toFixed(4), asset.status]);
    }

    const csv = `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    await appendAudit({
      companyId,
      actorId: context.user.id,
      action: "FINANCE_REGISTER_EXPORTED",
      module: "finance",
      entityType: "FinanceRegister",
      entityReference: register,
      metadata: { format: "CSV", label: definition.label, rowCount: body.length },
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${definition.filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
