import { PERMISSIONS } from "./permissions";

export function grantsForRole(code: string): string[] {
  const all = PERMISSIONS.map((item) => item.key);
  const keys = (predicate: (key: string) => boolean) => all.filter(predicate);
  const prefix = (...values: string[]) => keys((key) => values.some((value) => key.startsWith(value)));
  const viewKeys = keys((key) => key.endsWith(".view") && !key.startsWith("finance."));
  const detailedFinance = PERMISSIONS.filter((permission) => permission.module === "finance").map((permission) => permission.key);
  const financeReadOnly = detailedFinance.filter((key) =>
    [
      "FINANCE_DASHBOARD_VIEW",
      "COA_VIEW",
      "GL_VIEW",
      "CUSTOMER_LEDGER_VIEW",
      "SUPPLIER_LEDGER_VIEW",
      "PAYMENT_VIEW",
      "finance.paymentmethod.view",
      "BANK_LEDGER_VIEW",
      "ASSET_VIEW",
      "INCENTIVE_VIEW",
      "REBATE_VIEW",
      "BUDGET_VIEW",
      "PERIOD_VIEW",
      "FINANCIAL_REPORTS_VIEW",
    ].includes(key),
  );

  switch (code) {
    case "SUPER_ADMIN":
    case "OWNER":
      return all;
    case "ADMINISTRATOR":
      return all.filter((key) => key !== "backup.restore" && !detailedFinance.includes(key));
    case "INVENTORY_MANAGER":
      return ["dashboard.view", ...prefix("organization.branch.view", "organization.warehouse.view", "catalog.", "inventory.", "production.", "report.inventory", "label.", "audit.view")];
    case "WAREHOUSE_MANAGER":
      return ["dashboard.view", ...prefix("organization.warehouse.view", "catalog.product.view", "inventory.device.view", "inventory.stock.", "inventory.transfer.", "inventory.stocktake.", "report.inventory", "label.print")];
    case "PURCHASE_MANAGER":
      return ["dashboard.view", ...prefix("organization.branch.view", "organization.warehouse.view", "catalog.product.view", "catalog.cost.view", "purchase.", "supplier.", "inventory.device.import", "inventory.stock.view", "report.inventory", "report.purchase"), "PURCHASE_ORDER_CREATE", "PURCHASE_ORDER_APPROVE", "PURCHASE_ORDER_CANCEL", "PURCHASE_ORDER_CLOSE", "PURCHASE_TAX_OVERRIDE", "PURCHASE_RECEIPT_CREATE", "PURCHASE_DIRECT_RECEIPT_CREATE", "PURCHASE_OVER_RECEIPT", "PURCHASE_RECEIPT_INSPECT", "PURCHASE_RECEIPT_APPROVE", "PURCHASE_RECEIPT_CANCEL", "PURCHASE_DOCUMENT_ATTACHMENT", "PURCHASE_RECEIPT_POST", "PURCHASE_RECEIPT_REVERSE", "PURCHASE_RETURN_CREATE", "PURCHASE_RETURN_APPROVE", "PURCHASE_RETURN_POST"];
    case "PROCUREMENT_OFFICER":
      return ["dashboard.view", "organization.branch.view", "organization.warehouse.view", "catalog.product.view", "catalog.cost.view", "purchase.view", "supplier.manage", "inventory.stock.view", "PURCHASE_ORDER_CREATE", "PURCHASE_ORDER_CANCEL", "PURCHASE_RECEIPT_CREATE", "PURCHASE_RECEIPT_CANCEL", "PURCHASE_DOCUMENT_ATTACHMENT", "PURCHASE_RETURN_CREATE"];
    case "PROCUREMENT_APPROVER":
      return ["dashboard.view", "organization.branch.view", "organization.warehouse.view", "catalog.product.view", "catalog.cost.view", "purchase.view", "inventory.stock.view", "PURCHASE_ORDER_APPROVE", "PURCHASE_ORDER_CANCEL", "PURCHASE_ORDER_CLOSE", "PURCHASE_OVER_RECEIPT", "PURCHASE_RECEIPT_INSPECT", "PURCHASE_RECEIPT_APPROVE", "PURCHASE_RECEIPT_CANCEL", "PURCHASE_DOCUMENT_ATTACHMENT", "PURCHASE_RETURN_APPROVE", "audit.view"];
    case "RECEIVING_POSTER":
      return ["dashboard.view", "organization.warehouse.view", "catalog.product.view", "catalog.cost.view", "purchase.view", "inventory.stock.view", "inventory.device.view", "PURCHASE_RECEIPT_POST", "PURCHASE_RECEIPT_REVERSE", "PURCHASE_RETURN_POST", "label.print", "audit.view"];
    case "SALES_MANAGER":
      return ["dashboard.view", "catalog.pricelist.view", ...prefix("catalog.product.view", "catalog.price.change", "inventory.stock.view", "inventory.device.view", "sales.", "customer.", "report.sales", "report.profitability"), "SALES_INVOICE_CREATE", "SALES_INVOICE_APPROVE", "SALES_INVOICE_POST", "SALES_INVOICE_REVERSE", "SALES_RETURN_CREATE", "SALES_RETURN_APPROVE", "SALES_RETURN_POST"];
    case "SALES_OFFICER":
      return ["dashboard.view", "catalog.product.view", "catalog.pricelist.view", "catalog.price.change", "inventory.stock.view", "inventory.device.view", "sales.view", "customer.manage", "SALES_INVOICE_CREATE", "SALES_RETURN_CREATE"];
    case "SALES_APPROVER":
      return ["dashboard.view", "catalog.product.view", "inventory.stock.view", "sales.view", "report.sales", "SALES_INVOICE_APPROVE", "SALES_RETURN_APPROVE", "audit.view"];
    case "SALES_POSTER":
      return ["dashboard.view", "catalog.product.view", "inventory.stock.view", "inventory.device.view", "sales.view", "SALES_INVOICE_POST", "SALES_INVOICE_REVERSE", "SALES_RETURN_POST", "audit.view"];
    case "CASHIER":
      return ["dashboard.view", "catalog.product.view", "catalog.pricelist.view", "inventory.stock.view", "inventory.device.view", "sales.view", "sales.create", "customer.manage", "SALES_INVOICE_CREATE", "PAYMENT_CREATE", "label.print"];
    case "ACCOUNTANT":
      return [
        "dashboard.view",
        ...financeReadOnly,
        "COA_CREATE",
        "COA_EDIT",
        "JOURNAL_CREATE",
        "PAYMENT_CREATE",
        "finance.paymentmethod.manage",
        "BANK_ACCOUNT_MANAGE",
        "BANK_RECONCILIATION_PREPARE",
        "ASSET_CREATE",
        "ASSET_CATEGORY_MANAGE",
        "INCENTIVE_PLAN_MANAGE",
        "INCENTIVE_CALCULATE",
        "INCENTIVE_RECEIVABLE_CREATE",
        "REBATE_MANAGE",
        "BUDGET_CREATE",
        "PERIOD_CLOSE_REQUEST",
        "OPENING_BALANCE_IMPORT",
        ...prefix("purchase.view", "sales.view", "supplier.manage", "customer.manage", "expense.manage", "report.finance", "report.sales", "audit.view"),
      ];
    case "FINANCE_CONTROLLER":
      return [
        "dashboard.view",
        ...financeReadOnly,
        "JOURNAL_APPROVE",
        "PAYMENT_APPROVE",
        "PAYMENT_REVERSE",
        "BANK_RECONCILIATION_APPROVE",
        "ASSET_CREATE",
        "ASSET_DISPOSAL_APPROVE",
        "INCENTIVE_APPROVE",
        "INCENTIVE_RECEIVABLE_APPROVE",
        "REBATE_APPROVE",
        "BUDGET_APPROVE",
        "PERIOD_CLOSE",
        "OPENING_BALANCE_APPROVE",
        "FINANCIAL_REPORTS_EXPORT",
        "audit.view",
      ];
    case "GL_POSTING_OFFICER":
      return [
        "dashboard.view",
        ...financeReadOnly,
        "JOURNAL_POST",
        "JOURNAL_REVERSE",
        "ASSET_DEPRECIATION_POST",
        "OPENING_BALANCE_POST",
        "audit.view",
      ];
    case "TREASURY_OFFICER":
      return [
        "dashboard.view",
        ...financeReadOnly,
        "PAYMENT_POST",
        "PAYMENT_REVERSE",
        "BANK_RECONCILIATION_PREPARE",
        "INCENTIVE_PAY",
        "INCENTIVE_RECEIVE",
        "REBATE_PAY",
        "REBATE_RECEIVE",
        "audit.view",
      ];
    case "AUDITOR":
      return [...viewKeys, ...financeReadOnly, "catalog.cost.view", "report.inventory", "report.sales", "report.finance", "audit.view", "audit.export", "FINANCIAL_REPORTS_EXPORT", "system.health.view"];
    case "BRANCH_MANAGER":
      return ["dashboard.view", ...prefix("organization.branch.view", "organization.warehouse.view", "catalog.product.", "catalog.cost.view", "inventory.", "purchase.view", "purchase.create", "sales.", "customer.", "supplier.manage", "expense.manage", "report.inventory", "report.sales")];
    case "STOREKEEPER":
      return ["dashboard.view", "catalog.product.view", "inventory.device.view", "inventory.stock.view", "inventory.transfer.view", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.stocktake.manage", "label.print"];
    case "CUSTOMER_SERVICE":
      return ["dashboard.view", "catalog.product.view", "inventory.device.view", "sales.view", "customer.manage", "sales.return"];
    case "READ_ONLY":
      return ["dashboard.view", "organization.branch.view", "organization.warehouse.view", "catalog.product.view", "inventory.stock.view", "sales.view"];
    default:
      return [];
  }
}
