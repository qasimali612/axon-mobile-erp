import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approvePurchaseOrder, approvePurchaseReceipt } from "@/lib/operations/purchase";
import { approveSalesInvoice } from "@/lib/operations/sales";
import { approveStockTransfer } from "@/lib/operations/stock-transfer";
import { approvePayment } from "@/lib/operations/payments";
import { approveJournal } from "@/lib/finance/posting";
import { approveBudget } from "@/lib/finance/budgets";
import { approveIncentive } from "@/lib/finance/incentives";
import { approveRebate } from "@/lib/finance/rebates";

const actionSchema = z.object({
  documentType: z.enum([
    "PURCHASE_ORDER",
    "PURCHASE_RECEIPT",
    "SALES_INVOICE",
    "STOCK_TRANSFER",
    "STOCK_ADJUSTMENT",
    "PAYMENT",
    "JOURNAL",
    "BUDGET",
    "INCENTIVE",
    "REBATE",
  ]),
  id: z.string().uuid("Invalid document ID"),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional().default(""),
});

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    const companyId = context.company.id;

    const [
      purchaseOrders,
      purchaseReceipts,
      salesInvoices,
      stockTransfers,
      stockAdjustments,
      payments,
      journals,
      budgets,
    ] = await Promise.all([
      // Purchase Orders
      prisma.purchaseOrder.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          supplier: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { orderDate: "desc" },
      }),

      // Purchase Receipts
      prisma.purchaseReceipt.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          supplier: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { receiptDate: "desc" },
      }),

      // Sales Invoices
      prisma.salesInvoice.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          customer: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { invoiceDate: "desc" },
      }),

      // Stock Transfers
      prisma.stockTransfer.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          sourceWarehouse: { select: { name: true } },
          destinationWarehouse: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { transferDate: "desc" },
      }),

      // Stock Adjustments
      prisma.stockAdjustment.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          warehouse: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { adjustmentDate: "desc" },
      }),

      // Payments
      prisma.payment.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { paymentDate: "desc" },
      }),

      // Journals / Expenses
      prisma.journalEntry.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
          lines: { take: 2, include: { account: { select: { name: true } } } },
        },
        orderBy: { postingDate: "desc" },
      }),

      // Budgets
      prisma.budget.findMany({
        where: { companyId, status: "SUBMITTED" },
        include: {
          branch: { select: { name: true } },
          fiscalYear: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Unified List
    const items = [
      ...purchaseOrders.map((po) => ({
        id: po.id,
        documentType: "PURCHASE_ORDER" as const,
        documentNumber: po.orderNumber,
        documentDate: po.orderDate.toISOString().slice(0, 10),
        domain: "Procurement" as const,
        branch: po.branch.name,
        counterparty: po.supplier.name,
        summary: `PO for ${po.supplier.name}`,
        amount: po.grandTotal.toString(),
        preparer: po.preparedBy,
        viewUrl: `/purchases`,
        createdAt: po.createdAt.toISOString(),
      })),

      ...purchaseReceipts.map((gr) => ({
        id: gr.id,
        documentType: "PURCHASE_RECEIPT" as const,
        documentNumber: gr.receiptNumber,
        documentDate: gr.receiptDate.toISOString().slice(0, 10),
        domain: "Procurement" as const,
        branch: gr.branch.name,
        counterparty: gr.supplier.name,
        summary: `Goods receipt from ${gr.supplier.name}`,
        amount: gr.grandTotal.toString(),
        preparer: gr.preparedBy,
        viewUrl: `/goods-receipts/${gr.id}`,
        createdAt: gr.createdAt.toISOString(),
      })),

      ...salesInvoices.map((inv) => ({
        id: inv.id,
        documentType: "SALES_INVOICE" as const,
        documentNumber: inv.invoiceNumber,
        documentDate: inv.invoiceDate.toISOString().slice(0, 10),
        domain: "Sales" as const,
        branch: inv.branch.name,
        counterparty: inv.customer.name,
        summary: `Sales invoice to ${inv.customer.name}`,
        amount: inv.grandTotal.toString(),
        preparer: inv.preparedBy,
        viewUrl: `/sales/${inv.id}`,
        createdAt: inv.createdAt.toISOString(),
      })),

      ...stockTransfers.map((st) => ({
        id: st.id,
        documentType: "STOCK_TRANSFER" as const,
        documentNumber: st.transferNumber,
        documentDate: st.transferDate.toISOString().slice(0, 10),
        domain: "Inventory" as const,
        branch: `${st.sourceWarehouse.name} -> ${st.destinationWarehouse.name}`,
        counterparty: st.destinationWarehouse.name,
        summary: `Transfer: ${st.sourceWarehouse.name} to ${st.destinationWarehouse.name}`,
        amount: "0",
        preparer: st.preparedBy,
        viewUrl: `/inventory/transfers`,
        createdAt: st.createdAt.toISOString(),
      })),

      ...stockAdjustments.map((sa) => ({
        id: sa.id,
        documentType: "STOCK_ADJUSTMENT" as const,
        documentNumber: sa.adjustmentNumber,
        documentDate: sa.adjustmentDate.toISOString().slice(0, 10),
        domain: "Inventory" as const,
        branch: sa.warehouse.name,
        counterparty: sa.reason,
        summary: `Adjustment: ${sa.reason} (${sa.warehouse.name})`,
        amount: "0",
        preparer: sa.preparedBy,
        viewUrl: `/inventory/adjustments`,
        createdAt: sa.createdAt.toISOString(),
      })),

      ...payments.map((p) => ({
        id: p.id,
        documentType: "PAYMENT" as const,
        documentNumber: p.paymentNumber,
        documentDate: p.paymentDate.toISOString().slice(0, 10),
        domain: "Finance" as const,
        branch: p.branch.name,
        counterparty: p.customer?.name || p.supplier?.name || "Direct Party",
        summary: `${p.direction.replace("_", " ")}: ${p.customer?.name || p.supplier?.name || ""}`,
        amount: p.amount.toString(),
        preparer: p.preparedBy,
        viewUrl: `/finance/payments`,
        createdAt: p.createdAt.toISOString(),
      })),

      ...journals.map((j) => ({
        id: j.id,
        documentType: "JOURNAL" as const,
        documentNumber: j.voucherNumber,
        documentDate: j.postingDate.toISOString().slice(0, 10),
        domain: "Finance" as const,
        branch: j.branch.name,
        counterparty: j.referenceDocument || j.sourceModule || "General Voucher",
        summary: j.narration,
        amount: j.lines[0]?.baseDebit?.toString() || "0",
        preparer: j.preparedBy,
        viewUrl: `/finance/journals/${j.id}`,
        createdAt: j.createdAt.toISOString(),
      })),

      ...budgets.map((b) => ({
        id: b.id,
        documentType: "BUDGET" as const,
        documentNumber: b.code,
        documentDate: b.createdAt.toISOString().slice(0, 10),
        domain: "Finance" as const,
        branch: b.branch?.name || "All Branches",
        counterparty: `FY ${b.fiscalYear.code}`,
        summary: `Budget Plan: ${b.name}`,
        amount: "0",
        preparer: { id: "", fullName: "Finance Planning", email: "finance@company.local" },
        viewUrl: `/finance/budgets`,
        createdAt: b.createdAt.toISOString(),
      })),
    ];

    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const counts = {
      total: items.length,
      procurement: items.filter((i) => i.domain === "Procurement").length,
      sales: items.filter((i) => i.domain === "Sales").length,
      inventory: items.filter((i) => i.domain === "Inventory").length,
      finance: items.filter((i) => i.domain === "Finance").length,
    };

    return NextResponse.json({
      data: {
        items,
        counts,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const json = await request.json();
    const parsed = actionSchema.parse(json);

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    let result;

    if (parsed.action === "approve") {
      switch (parsed.documentType) {
        case "PURCHASE_ORDER":
          result = await approvePurchaseOrder(actor, parsed.id);
          break;
        case "PURCHASE_RECEIPT":
          result = await approvePurchaseReceipt(actor, parsed.id);
          break;
        case "SALES_INVOICE":
          result = await approveSalesInvoice(actor, parsed.id);
          break;
        case "STOCK_TRANSFER":
          result = await approveStockTransfer(actor, parsed.id);
          break;
        case "PAYMENT":
          result = await approvePayment(actor, parsed.id);
          break;
        case "JOURNAL":
          result = await approveJournal(actor, parsed.id);
          break;
        case "BUDGET":
          result = await approveBudget(actor, parsed.id);
          break;
        case "INCENTIVE":
          result = await approveIncentive(actor, parsed.id);
          break;
        case "REBATE":
          result = await approveRebate(actor, parsed.id);
          break;
        default:
          throw new ApiError(400, "UNSUPPORTED_TYPE", "Unsupported document type for approval.");
      }
    } else {
      // Reject action
      switch (parsed.documentType) {
        case "PURCHASE_ORDER":
          result = await prisma.purchaseOrder.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "REJECTED" },
          });
          break;
        case "PURCHASE_RECEIPT":
          result = await prisma.purchaseReceipt.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "REJECTED" },
          });
          break;
        case "SALES_INVOICE":
          result = await prisma.salesInvoice.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "DRAFT" },
          });
          break;
        case "STOCK_TRANSFER":
          result = await prisma.stockTransfer.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "CANCELLED" },
          });
          break;
        case "STOCK_ADJUSTMENT":
          result = await prisma.stockAdjustment.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "CANCELLED" },
          });
          break;
        case "PAYMENT":
          result = await prisma.payment.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "REJECTED" },
          });
          break;
        case "JOURNAL":
          result = await prisma.journalEntry.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "REJECTED" },
          });
          break;
        case "BUDGET":
          result = await prisma.budget.update({
            where: { id: parsed.id, companyId: actor.companyId },
            data: { status: "DRAFT" },
          });
          break;
        default:
          throw new ApiError(400, "UNSUPPORTED_TYPE", "Unsupported document type for rejection.");
      }
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
