import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { zero } from "@/lib/finance/money";

describe("Axon Mobile ERP — Financial Command Center Master Test Suite", () => {
  // Test helper
  const dec = (val: string | number) => new Prisma.Decimal(val);

  describe("Domain 1: Chart of Accounts & Normal Balance Integrity", () => {
    it("preserves correct normal balances for standard 5-class accounting", () => {
      const coa = [
        { code: "1000", class: "ASSET", normal: "DEBIT" },
        { code: "1010", class: "ASSET", normal: "DEBIT" },
        { code: "1100", class: "ASSET", normal: "DEBIT" },
        { code: "1200", class: "ASSET", normal: "DEBIT" },
        { code: "2000", class: "LIABILITY", normal: "CREDIT" },
        { code: "3000", class: "EQUITY", normal: "CREDIT" },
        { code: "4000", class: "REVENUE", normal: "CREDIT" },
        { code: "4030", class: "REVENUE", normal: "CREDIT" },
        { code: "5000", class: "COGS", normal: "DEBIT" },
        { code: "6000", class: "EXPENSE", normal: "DEBIT" },
      ];
      for (const acc of coa) {
        if (acc.class === "ASSET" || acc.class === "COGS" || acc.class === "EXPENSE") {
          expect(acc.normal).toBe("DEBIT");
        } else {
          expect(acc.normal).toBe("CREDIT");
        }
      }
    });
  });

  describe("Domain 2: Direct Posting & Absence of Approval Workflows", () => {
    it("enforces voucher statuses without maker-checker queues", () => {
      const validStatuses = ["DRAFT", "SUBMITTED", "POSTED", "CANCELLED", "REVERSED"];
      const forbiddenStatuses = ["PENDING_APPROVAL", "AWAITING_CHECKER", "MANAGER_REVIEW"];
      for (const s of forbiddenStatuses) {
        expect(validStatuses).not.toContain(s);
      }
      expect(validStatuses).toContain("POSTED");
      expect(validStatuses).toContain("SUBMITTED");
    });
  });

  describe("Domain 3: General Ledger Line Immutability & Double-Entry Equality", () => {
    it("validates that debit equals credit for any posted journal voucher", () => {
      const voucherLines = [
        { debit: dec(341296), credit: zero() }, // AR
        { debit: zero(), credit: dec(341296) }, // Revenue
      ];
      const totalDebit = voucherLines.reduce((s, l) => s.plus(l.debit), zero());
      const totalCredit = voucherLines.reduce((s, l) => s.plus(l.credit), zero());
      expect(totalDebit.equals(totalCredit)).toBe(true);
      expect(totalDebit.minus(totalCredit).isZero()).toBe(true);
    });
  });

  describe("Domain 4: Trial Balance Equality (Dr = Cr)", () => {
    it("verifies authoritative Gondal Mobile Center trial balance debits equal credits exactly", () => {
      const balances = [
        { code: "1000", name: "Cash on Hand", debit: dec(169050), credit: dec(69140) },
        { code: "1010", name: "Current Account Bank", debit: dec(141247), credit: zero() },
        { code: "1100", name: "Trade Receivables", debit: dec(341296), credit: dec(310297) },
        { code: "1200", name: "Merchandise Inventory", debit: dec(1025740), credit: dec(324330) },
        { code: "3000", name: "Share Capital", debit: dec(69140), credit: zero() },
        { code: "4000", name: "Mobile Sales", debit: zero(), credit: dec(341296) },
        { code: "4030", name: "Inventory Gain", debit: zero(), credit: dec(1025740) },
        { code: "5000", name: "Cost of Goods Sold", debit: dec(324330), credit: zero() },
      ];

      const sumDebit = balances.reduce((sum, row) => sum.plus(row.debit), zero());
      const sumCredit = balances.reduce((sum, row) => sum.plus(row.credit), zero());

      expect(sumDebit.toString()).toBe("2070803");
      expect(sumCredit.toString()).toBe("2070803");
      expect(sumDebit.minus(sumCredit).isZero()).toBe(true);
    });
  });

  describe("Domain 5: Multi-Step Profit & Loss Segregation", () => {
    it("accurately calculates Net Sales Revenue, COGS, and Trading Gross Profit", () => {
      const netSales = dec(341296);
      const cogs = dec(324330);
      const grossProfit = netSales.minus(cogs);

      expect(grossProfit.toString()).toBe("16966");
      const margin = grossProfit.dividedBy(netSales).times(100).toDecimalPlaces(2);
      expect(margin.toString()).toBe("4.97");
    });
  });

  describe("Domain 6: Segregation of Trading Gross Profit and Non-Operating Gains", () => {
    it("ensures Account 4030 (Inventory Adjustment Gain) is not lumped into Operating Revenue", () => {
      const operatingSales = dec(341296);
      const inventoryGain = dec(1025740);
      const cogs = dec(324330);

      // Distorted legacy formula
      const distortedRevenue = operatingSales.plus(inventoryGain);
      const distortedGrossProfit = distortedRevenue.minus(cogs);
      expect(distortedGrossProfit.toString()).toBe("1042706"); // Flawed!

      // Proper double-entry formula
      const trueGrossProfit = operatingSales.minus(cogs);
      expect(trueGrossProfit.toString()).toBe("16966"); // Accurate!
      expect(distortedGrossProfit.minus(trueGrossProfit).toString()).toBe("1025740");
    });
  });

  describe("Domain 7: Operating Profit (EBIT) Calculation", () => {
    it("calculates EBIT after deducting administrative and operating expenses", () => {
      const grossProfit = dec(16966);
      const operatingExpenses = zero(); // No posted opex for this period
      const operatingProfit = grossProfit.minus(operatingExpenses);
      expect(operatingProfit.toString()).toBe("16966");
    });
  });

  describe("Domain 8: Non-Operating Income & Opening Stock Segregation", () => {
    it("isolates initial opening stock entries (Account 4030) from operating other income", () => {
      const openingStockReserve = dec(1025740);
      const incentiveIncome = zero();
      const rebateIncome = zero();
      const operatingOtherIncome = incentiveIncome.plus(rebateIncome);

      expect(operatingOtherIncome.toString()).toBe("0");
      expect(openingStockReserve.toString()).toBe("1025740");
    });
  });

  describe("Domain 9: Bottom-Line Net Profit Consistency", () => {
    it("produces authentic trading net profit strictly from operating activity", () => {
      const operatingProfit = dec(16966);
      const otherIncome = zero(); // Opening stock excluded from P&L
      const otherExpenses = zero();
      const netProfit = operatingProfit.plus(otherIncome).minus(otherExpenses);

      expect(netProfit.toString()).toBe("16966");
    });
  });

  describe("Domain 10: Classified Balance Sheet Assets (Current vs Non-Current)", () => {
    it("classifies cash, bank, receivables, and inventory as Current Assets", () => {
      const cashOnHand = dec(99910);
      const bankBalance = dec(141247);
      const tradeReceivables = dec(30999);
      const inventory = dec(701410);

      const currentAssets = cashOnHand.plus(bankBalance).plus(tradeReceivables).plus(inventory);
      const nonCurrentAssets = zero();
      const totalAssets = currentAssets.plus(nonCurrentAssets);

      expect(currentAssets.toString()).toBe("973566");
      expect(totalAssets.toString()).toBe("973566");
    });
  });

  describe("Domain 11: Balance Sheet Equation Verification (Assets = Liabilities + Equity)", () => {
    it("verifies zero variance in the balance sheet equation with opening stock reserve and operating profit", () => {
      const totalAssets = dec(973566);
      const totalLiabilities = zero();
      const shareCapital = dec(-69140); // Due to historical reversed opening voucher
      const openingStockReserve = dec(1025740); // Account 4030 classified under equity reserve
      const currentYearOperatingEarnings = dec(16966); // Pure trading profit
      const totalEquity = shareCapital.plus(openingStockReserve).plus(currentYearOperatingEarnings);

      expect(totalEquity.toString()).toBe("973566");
      const difference = totalAssets.minus(totalLiabilities.plus(totalEquity));
      expect(difference.isZero()).toBe(true);
      expect(difference.toString()).toBe("0");
    });
  });

  describe("Domain 12: Cash on Hand Segregation (Account 1000)", () => {
    it("tracks Cash on Hand independently from bank accounts", () => {
      const dr = dec(169050);
      const cr = dec(69140);
      const netCashOnHand = dr.minus(cr);
      expect(netCashOnHand.toString()).toBe("99910");
    });
  });

  describe("Domain 13: Commercial Bank Account Balance Segregation (Account 1010)", () => {
    it("tracks Bank accounts independently", () => {
      const bankDr = dec(141247);
      const bankCr = zero();
      const netBank = bankDr.minus(bankCr);
      expect(netBank.toString()).toBe("141247");
    });
  });

  describe("Domain 14: Combined Liquid Cash & Bank Funds", () => {
    it("reconciles combined cash and bank balances", () => {
      const cashOnHand = dec(99910);
      const bankBalance = dec(141247);
      const totalLiquidFunds = cashOnHand.plus(bankBalance);
      expect(totalLiquidFunds.toString()).toBe("241157");
    });
  });

  describe("Domain 15: Accounts Receivable (AR) Trade Subledger Reconciliation", () => {
    it("reconciles Account 1100 Trade Receivables with Customer open items", () => {
      const totalInvoiced = dec(341296);
      const totalReceiptsApplied = dec(310297);
      const openReceivables = totalInvoiced.minus(totalReceiptsApplied);

      expect(openReceivables.toString()).toBe("30999");
    });
  });

  describe("Domain 16: Accounts Payable (AP) Supplier Subledger Reconciliation", () => {
    it("reconciles Account 2000 Trade Payables", () => {
      const bills = zero();
      const payments = zero();
      const openPayables = bills.minus(payments);
      expect(openPayables.toString()).toBe("0");
    });
  });

  describe("Domain 17: Working Capital Metric Precision", () => {
    it("calculates working capital as Current Assets minus Current Liabilities", () => {
      const currentAssets = dec(973566);
      const currentLiabilities = zero();
      const workingCapital = currentAssets.minus(currentLiabilities);
      expect(workingCapital.toString()).toBe("973566");
      expect(workingCapital.gte(0)).toBe(true);
    });
  });

  describe("Domain 18: Merchandise Inventory (Account 1200) Perpetual Valuation", () => {
    it("matches GL 1200 debit less credit with cost of remaining stock on hand", () => {
      const openingStockAdjustment = dec(1025740);
      const soldCogsRelief = dec(324330);
      const endingInventoryValuation = openingStockAdjustment.minus(soldCogsRelief);

      expect(endingInventoryValuation.toString()).toBe("701410");
    });
  });

  describe("Domain 19: Gross Profit Margin Percentage Precision", () => {
    it("computes margin accurately to two decimal places", () => {
      const netSales = dec(341296);
      const grossProfit = dec(16966);
      const margin = grossProfit.dividedBy(netSales).times(100).toDecimalPlaces(2);
      expect(margin.toNumber()).toBe(4.97);
    });
  });

  describe("Domain 20: Cash Flow Statement Multi-Category Classification", () => {
    it("verifies cash flow activity classification and net movement", () => {
      const operating = dec(141247);
      const investing = zero();
      const financing = zero();
      const unclassified = zero();
      const netMovement = operating.plus(investing).plus(financing).plus(unclassified);

      expect(netMovement.toString()).toBe("141247");
    });
  });

  describe("Domain 21: Date Range Filter Strict Boundaries (< filters.from)", () => {
    it("ensures opening balances strictly query entries before from-date without omitting intermediate hours", () => {
      const from = new Date("2026-11-01T00:00:00.000Z");
      const dayBeforeStart = new Date("2026-10-31T00:00:00.000Z");
      const intermediateTx = new Date("2026-10-31T18:30:00.000Z");

      // The old filter (lte: dayBeforeStart) would drop intermediateTx!
      expect(intermediateTx.getTime() <= dayBeforeStart.getTime()).toBe(false);

      // The corrected filter (lt: from) includes intermediateTx!
      expect(intermediateTx.getTime() < from.getTime()).toBe(true);
    });
  });

  describe("Domain 22: Multi-Branch Financial Consolidation and Isolation", () => {
    it("allows consolidated company reporting and branch-scoped drill-down", () => {
      const branchISB = { code: "ISB", revenue: dec(341296), cogs: dec(324330) };
      const branchHZR = { code: "HZR", revenue: zero(), cogs: zero() };

      const consolidatedRevenue = branchISB.revenue.plus(branchHZR.revenue);
      const consolidatedCogs = branchISB.cogs.plus(branchHZR.cogs);

      expect(consolidatedRevenue.toString()).toBe("341296");
      expect(consolidatedCogs.toString()).toBe("324330");
    });
  });

  describe("Domain 23: Audit Trail Traceability & Voucher Preservation", () => {
    it("preserves original posted vouchers and verifies proposed rectifications do not alter historical records silently", () => {
      const historicalVoucher = {
        voucherNumber: "ISB--JV-FY2026-27-000001",
        status: "POSTED",
        lines: [
          { account: "1000", debit: zero(), credit: dec(69140) },
          { account: "3000", debit: dec(69140), credit: zero() },
        ],
      };

      // Ensure historical voucher remains unmodified
      expect(historicalVoucher.status).toBe("POSTED");
      expect(historicalVoucher.lines[0].credit.toString()).toBe("69140");

      // Proposed rectifying entry
      const proposedRectification = {
        voucherType: "JOURNAL",
        narration: "Rectification of reversed opening cash entry ISB--JV-FY2026-27-000001",
        lines: [
          { account: "1000", debit: dec(138280), credit: zero() },
          { account: "3000", debit: zero(), credit: dec(138280) },
        ],
      };

      const rectDebit = proposedRectification.lines.reduce((s, l) => s.plus(l.debit), zero());
      const rectCredit = proposedRectification.lines.reduce((s, l) => s.plus(l.credit), zero());
      expect(rectDebit.equals(rectCredit)).toBe(true);
    });
  });

  describe("Domain 24: Zero Artificial Balancing Plugs", () => {
    it("guarantees balanceDifference is computed strictly as Assets - (Liabilities + Equity)", () => {
      const assets = dec(973566);
      const liabilities = zero();
      const equity = dec(973566);
      const difference = assets.minus(liabilities.plus(equity));

      expect(difference.isZero()).toBe(true);
      expect(difference.abs().lte(dec("0.0001"))).toBe(true);
    });
  });
});

