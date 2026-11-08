/** Report keys accepted by the operational report endpoint and therefore by a report schedule. */
export const REPORT_KEYS = [
  "purchase-orders",
  "goods-receipts",
  "purchase-returns",
  "sales",
  "sales-returns",
  "inventory",
  "devices",
  "movements",
  "profitability",
  "reorder",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];
