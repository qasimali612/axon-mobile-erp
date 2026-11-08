import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertPermittedBranch, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderDocumentPdf, type PdfColumn } from "@/lib/pdf/simple-pdf";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ type: string; id: string }> };

const money = (value: { toNumber(): number }, currency: string) =>
  `${currency} ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value.toNumber())}`;
const day = (value: Date | null) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value) : "-";

const salesColumns: PdfColumn[] = [
  { label: "#", width: 26 },
  { label: "Item / IMEI", width: 250 },
  { label: "Qty", width: 46, align: "right" },
  { label: "Unit price", width: 80, align: "right" },
  { label: "Discount", width: 60, align: "right" },
  { label: "Tax", width: 55, align: "right" },
  { label: "Total", width: 76, align: "right" },
];
const purchaseColumns: PdfColumn[] = [
  { label: "#", width: 26 },
  { label: "Item / IMEI", width: 250 },
  { label: "Qty", width: 46, align: "right" },
  { label: "Unit cost", width: 80, align: "right" },
  { label: "Discount", width: 60, align: "right" },
  { label: "Tax", width: 55, align: "right" },
  { label: "Total", width: 76, align: "right" },
];

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { type, id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const permission = type === "invoice" ? "sales.view" : ["grn", "purchase-order"].includes(type) ? "purchase.view" : null;
    if (!permission) throw new ApiError(404, "UNKNOWN_DOCUMENT", "Only invoices, goods receipts and purchase orders can be rendered as PDF.");
    const context = await requirePermission(permission);

    let pdf: Uint8Array;
    let fileName: string;
    let audit: { entityType: string; entityId: string; reference: string; branchId: string | null };

    if (type === "invoice") {
      const invoice = await prisma.salesInvoice.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          company: true, branch: true, warehouse: true, customer: true,
          preparedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, postedBy: { select: { fullName: true } }, salesperson: { select: { fullName: true } },
          lines: { include: { product: true, variant: true, units: { include: { stockUnit: { include: { identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } } } } } }, orderBy: { lineNumber: "asc" } },
        },
      });
      if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      assertPermittedBranch(context, "sales.view", invoice.branchId);
      pdf = renderDocumentPdf({
        title: "Sales invoice",
        documentNumber: invoice.invoiceNumber,
        status: invoice.status,
        company: { name: invoice.company.legalName || invoice.company.name, address: [invoice.company.addressLine1, invoice.company.city, invoice.company.province].filter(Boolean).join(", "), tax: `Tax registration: ${invoice.company.taxRegistrationNumber || "N/A"}` },
        meta: [
          ["Invoice date", day(invoice.invoiceDate)], ["Due date", day(invoice.dueDate)],
          ["Customer", invoice.customer.name], ["Customer code", invoice.customer.code],
          ["Branch", invoice.branch.code], ["Warehouse", invoice.warehouse.code],
          ["Salesperson", invoice.salesperson?.fullName || "-"], ["Currency", invoice.currencyCode],
        ],
        columns: salesColumns,
        rows: invoice.lines.map((line) => [
          String(line.lineNumber),
          `${line.product.name} / ${line.variant.name}${line.units.length ? ` [${line.units.flatMap((unit) => unit.stockUnit.identifiers.map((identifier) => identifier.value)).join(", ")}]` : ""}`,
          line.quantity.toFixed(4), money(line.unitPrice, invoice.currencyCode), money(line.discountAmount, invoice.currencyCode), money(line.taxAmount, invoice.currencyCode), money(line.lineTotal, invoice.currencyCode),
        ]),
        totals: [
          ["Subtotal", money(invoice.subtotal, invoice.currencyCode)],
          ["Discount", money(invoice.discountTotal, invoice.currencyCode)],
          ["Tax", money(invoice.taxTotal, invoice.currencyCode)],
          ["Grand total", money(invoice.grandTotal, invoice.currencyCode)],
        ],
        notes: invoice.notes || undefined,
        footers: [`Prepared ${invoice.preparedBy.fullName}`, `Approved ${invoice.approvedBy?.fullName || "pending"}`, `Posted ${invoice.postedBy?.fullName || "not posted"}`, `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
      });
      fileName = `${invoice.invoiceNumber}.pdf`;
      audit = { entityType: "SalesInvoice", entityId: invoice.id, reference: invoice.invoiceNumber, branchId: invoice.branchId };
    } else if (type === "grn") {
      const receipt = await prisma.purchaseReceipt.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          company: true, branch: true, warehouse: true, supplier: true, purchaseOrder: { select: { orderNumber: true } },
          preparedBy: { select: { fullName: true } }, receivedBy: { select: { fullName: true } },
          lines: { include: { product: true, variant: true, units: { include: { stockUnit: { include: { identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } } } } } }, orderBy: { lineNumber: "asc" } },
        },
      });
      if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Goods receipt was not found.");
      assertPermittedBranch(context, "purchase.view", receipt.branchId);
      pdf = renderDocumentPdf({
        title: "Goods receipt note",
        documentNumber: receipt.receiptNumber,
        status: receipt.status,
        company: { name: receipt.company.legalName || receipt.company.name, address: [receipt.company.addressLine1, receipt.company.city, receipt.company.province].filter(Boolean).join(", "), tax: `Tax registration: ${receipt.company.taxRegistrationNumber || "N/A"}` },
        meta: [
          ["Receipt date", day(receipt.receiptDate)], ["Receipt type", receipt.receiptType],
          ["Supplier", receipt.supplier.name], ["Supplier code", receipt.supplier.code],
          ["Branch", receipt.branch.code], ["Warehouse", receipt.warehouse.code],
          ["Purchase order", receipt.purchaseOrder?.orderNumber || "Direct receipt"], ["Currency", receipt.currencyCode],
        ],
        columns: purchaseColumns,
        rows: receipt.lines.map((line) => [
          String(line.lineNumber),
          `${line.product.name} / ${line.variant.name}${line.units.length ? ` [${line.units.flatMap((unit) => (unit.stockUnit?.identifiers ?? []).map((identifier) => identifier.value)).join(", ")}]` : ""}`,
          line.quantity.toFixed(4), money(line.unitCost, receipt.currencyCode), money(line.discountAmount, receipt.currencyCode), money(line.taxAmount, receipt.currencyCode), money(line.lineTotal, receipt.currencyCode),
        ]),
        totals: [
          ["Subtotal", money(receipt.subtotal, receipt.currencyCode)],
          ["Discount", money(receipt.discountTotal, receipt.currencyCode)],
          ["Tax", money(receipt.taxTotal, receipt.currencyCode)],
          ["Grand total", money(receipt.grandTotal, receipt.currencyCode)],
        ],
        notes: receipt.notes || undefined,
        footers: [`Prepared ${receipt.preparedBy.fullName}`, `Received ${receipt.receivedBy.fullName}`, `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
      });
      fileName = `${receipt.receiptNumber}.pdf`;
      audit = { entityType: "PurchaseReceipt", entityId: receipt.id, reference: receipt.receiptNumber, branchId: receipt.branchId };
    } else {
      const order = await prisma.purchaseOrder.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          company: true, branch: true, warehouse: true, supplier: true,
          preparedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } },
          lines: { include: { product: true, variant: true }, orderBy: { lineNumber: "asc" } },
        },
      });
      if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
      assertPermittedBranch(context, "purchase.view", order.branchId);
      pdf = renderDocumentPdf({
        title: "Purchase order",
        documentNumber: order.orderNumber,
        status: order.status,
        company: { name: order.company.legalName || order.company.name, address: [order.company.addressLine1, order.company.city, order.company.province].filter(Boolean).join(", "), tax: `Tax registration: ${order.company.taxRegistrationNumber || "N/A"}` },
        meta: [
          ["Order date", day(order.orderDate)], ["Expected date", day(order.expectedDate)],
          ["Supplier", order.supplier.name], ["Supplier code", order.supplier.code],
          ["Branch", order.branch.code], ["Warehouse", order.warehouse.code],
          ["Payment terms", `${order.paymentTermsDays} days`], ["Currency", order.currencyCode],
        ],
        columns: purchaseColumns,
        rows: order.lines.map((line) => [
          String(line.lineNumber), `${line.product.name} / ${line.variant.name}`,
          line.orderedQuantity.toFixed(4), money(line.unitCost, order.currencyCode), money(line.discountAmount, order.currencyCode), money(line.taxAmount, order.currencyCode), money(line.lineTotal, order.currencyCode),
        ]),
        totals: [
          ["Subtotal", money(order.subtotal, order.currencyCode)],
          ["Discount", money(order.discountTotal, order.currencyCode)],
          ["Tax", money(order.taxTotal, order.currencyCode)],
          ["Grand total", money(order.grandTotal, order.currencyCode)],
        ],
        notes: order.notes || undefined,
        footers: [`Prepared ${order.preparedBy.fullName}`, `Approved ${order.approvedBy?.fullName || "pending"}`, `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
      });
      fileName = `${order.orderNumber}.pdf`;
      audit = { entityType: "PurchaseOrder", entityId: order.id, reference: order.orderNumber, branchId: order.branchId };
    }

    await appendAudit({
      companyId: context.company.id,
      actorId: context.user.id,
      branchId: audit.branchId,
      action: "DOCUMENT_PDF_GENERATED",
      module: "documents",
      entityType: audit.entityType,
      entityId: audit.entityId,
      entityReference: audit.reference,
      metadata: { bytes: pdf.byteLength },
    });

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
