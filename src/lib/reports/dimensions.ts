import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DatePreset =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "last-year"
  | "custom";

export const DATE_PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-week", label: "This Week" },
  { key: "last-week", label: "Last Week" },
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
  { key: "last-quarter", label: "Last Quarter" },
  { key: "this-year", label: "This Year" },
  { key: "last-year", label: "Last Year" },
  { key: "custom", label: "Custom Range" },
];

/**
 * Resolves a date preset or custom range into exact UTC boundaries.
 * Day end bounds use exclusive `< to` by advancing to the start of the next day.
 */
export function resolveDateRange(preset?: string | null, fromStr?: string | null, toStr?: string | null) {
  const now = new Date();
  
  if (preset && preset !== "custom") {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed
    const day = now.getUTCDate();
    const dayOfWeek = now.getUTCDay(); // 0 is Sunday

    switch (preset) {
      case "today": {
        const from = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "yesterday": {
        const from = new Date(Date.UTC(year, month, day - 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "this-week": {
        const diff = (dayOfWeek + 6) % 7; // Monday as 0
        const from = new Date(Date.UTC(year, month, day - diff, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month, day + (7 - diff), 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "last-week": {
        const diff = (dayOfWeek + 6) % 7;
        const from = new Date(Date.UTC(year, month, day - diff - 7, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month, day - diff, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "this-month": {
        const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "last-month": {
        const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "this-quarter": {
        const quarterStartMonth = Math.floor(month / 3) * 3;
        const from = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, quarterStartMonth + 3, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "last-quarter": {
        const quarterStartMonth = Math.floor(month / 3) * 3;
        const from = new Date(Date.UTC(year, quarterStartMonth - 3, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "this-year": {
        const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
      case "last-year": {
        const from = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
        const to = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        return { from, to, dateRange: { gte: from, lt: to } };
      }
    }
  }

  let from: Date | undefined;
  let to: Date | undefined;

  if (fromStr) {
    from = new Date(`${fromStr}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime())) from = undefined;
  }
  if (toStr) {
    to = new Date(`${toStr}T00:00:00.000Z`);
    if (Number.isNaN(to.getTime())) {
      to = undefined;
    } else {
      to.setUTCDate(to.getUTCDate() + 1); // exclusive end of day
    }
  }

  const dateRange = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
  return { from, to, dateRange };
}

/**
 * Loads permitted filter dimensions for reports.
 */
export async function getReportFilterDimensions(
  companyId: string,
  scopes?: Array<{ branchId?: string | null; warehouseId?: string | null }>
) {
  const branchWhere: Prisma.BranchWhereInput = {
    companyId,
    isActive: true,
    ...(scopes && scopes.length > 0 && scopes.some((s) => s.branchId)
      ? { OR: scopes.filter((s) => s.branchId).map((scope) => ({ id: scope.branchId! })) }
      : {}),
  };

  const warehouseWhere: Prisma.WarehouseWhereInput = {
    companyId,
    isActive: true,
    ...(scopes && scopes.length > 0 && scopes.some((s) => s.warehouseId)
      ? { OR: scopes.filter((s) => s.warehouseId).map((scope) => ({ id: scope.warehouseId! })) }
      : {}),
  };

  const [branches, warehouses, brands, categories, customers, suppliers, salespeople, paymentMethods] =
    await Promise.all([
      prisma.branch.findMany({
        where: branchWhere,
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      prisma.warehouse.findMany({
        where: warehouseWhere,
        select: { id: true, branchId: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      prisma.brand.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.productCategory.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, code: true, name: true, customerType: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.supplier.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.user.findMany({
        where: {
          memberships: { some: { companyId, status: "ACTIVE" } },
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.paymentMethod.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true, methodType: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return {
    branches,
    warehouses,
    brands,
    categories,
    customers,
    suppliers,
    salespeople,
    paymentMethods,
    presets: DATE_PRESETS,
  };
}

