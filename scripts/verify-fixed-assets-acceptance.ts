import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
type Session = { cookie: string; userAgent: string };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const money = (value: unknown) => Number(value);

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Asset-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function request(session: Session, path: string, options: { method?: string; body?: unknown; expected?: number | number[] } = {}): Promise<Row> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : { raw: text };
  const expected = Array.isArray(options.expected ?? 200) ? options.expected as number[] : [options.expected ?? 200];
  if (!expected.includes(response.status)) throw new Error(`${options.method || "GET"} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text}`);
  return body;
}

async function journalLines(journalId: string) {
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journalId }, include: { lines: { include: { account: { select: { code: true } } }, orderBy: { lineNumber: "asc" } } } });
  return {
    journal,
    lines: journal.lines.map((line) => ({ code: line.account.code, debit: money(line.debit), credit: money(line.credit) })),
    debitTotal: journal.lines.reduce((sum, line) => sum + money(line.debit), 0),
    creditTotal: journal.lines.reduce((sum, line) => sum + money(line.credit), 0),
  };
}

async function main() {
  const startedAt = new Date();
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const controller = await login("controller@axonmobile.local", company.id, branch.id, warehouse.id);
  const poster = await login("poster@axonmobile.local", company.id, branch.id, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, branch.id, warehouse.id);
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);

  const account = async (code: string) => prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code } } });
  const cash = await account("1000");
  const equipmentAtCost = await account("1500");
  const accumulated = await account("1510");
  const depreciationExpense = await account("6100");
  const disposalGainLoss = await account("6400");
  const inventoryAccount = await account("1200");
  const shareCapital = await account("3000");

  const categoryBody = {
    code: `AEQ${run.slice(-5)}`,
    name: `Acceptance Workshop Equipment ${run}`,
    depreciable: true,
    defaultUsefulLifeMonths: 60,
    defaultMethod: "STRAIGHT_LINE",
    defaultRate: null,
    assetAccountId: equipmentAtCost.id,
    accumulatedAccountId: accumulated.id,
    expenseAccountId: depreciationExpense.id,
    disposalAccountId: disposalGainLoss.id,
    isActive: true,
  };
  const assetBody = (overrides: Row = {}) => ({
    categoryId: "",
    branchId: branch.id,
    code: `FA-${run}`,
    name: `Acceptance Asset ${run}`,
    description: `Fixed asset acceptance ${run}`,
    serialNumber: `SN-${run}`,
    supplierId: null,
    custodianId: null,
    assetLocation: "Hazro showroom",
    purchaseDate: day(-20),
    capitalizationDate: day(-2),
    depreciationStartDate: null,
    purchaseCost: "1000.0000",
    additionalCost: "0",
    residualValue: "0",
    usefulLifeMonths: 12,
    depreciationMethod: "STRAIGHT_LINE",
    depreciationRate: null,
    ...overrides,
  });

  // 1 · permission boundaries -------------------------------------------------
  await request(buyer, "/api/finance/asset-categories", { method: "POST", body: categoryBody, expected: 403 });
  await request(buyer, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: equipmentAtCost.id }), expected: 403 });
  await request(controller, "/api/finance/asset-categories", { method: "POST", body: categoryBody, expected: 403 });
  await request(accountant, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate: day() }, expected: 403 });
  console.log("✓ asset masters, acquisition, depreciation posting, and disposal are permission-gated");

  // 2 · category master validation and creation -------------------------------
  const duplicateMapping = await request(accountant, "/api/finance/asset-categories", { method: "POST", body: { ...categoryBody, accumulatedAccountId: equipmentAtCost.id }, expected: 422 });
  assert(/different ledger account/i.test(JSON.stringify(duplicateMapping)), "Duplicate account mapping was not rejected with an explanation.");
  const wrongClass = await request(accountant, "/api/finance/asset-categories", { method: "POST", body: { ...categoryBody, assetAccountId: shareCapital.id }, expected: 422 });
  assert(/asset account/i.test(JSON.stringify(wrongClass)), "A non-asset cost account was not rejected.");
  const badExpense = await request(accountant, "/api/finance/asset-categories", { method: "POST", body: { ...categoryBody, expenseAccountId: inventoryAccount.id }, expected: 422 });
  assert(/expense/i.test(JSON.stringify(badExpense)), "A non-expense depreciation account was not rejected.");
  const category = await request(accountant, "/api/finance/asset-categories", { method: "POST", body: categoryBody, expected: 201 });
  await request(accountant, "/api/finance/asset-categories", { method: "POST", body: categoryBody, expected: 409 });
  console.log("✓ category master enforces four distinct, correctly classified ledger accounts");

  // 3 · draft controls --------------------------------------------------------
  const residualTooHigh = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, purchaseCost: "100.0000", residualValue: "100.0000" }), expected: 422 });
  assert(/residual/i.test(JSON.stringify(residualTooHigh)), "A residual value at or above cost was not rejected.");
  const missingLife = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, usefulLifeMonths: null }), expected: 422 });
  assert(/useful life/i.test(JSON.stringify(missingLife)), "Straight-line depreciation without a useful life was not rejected.");
  const missingRate = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, depreciationMethod: "DECLINING_BALANCE", depreciationRate: null }), expected: 422 });
  assert(/rate/i.test(JSON.stringify(missingRate)), "Declining balance without an annual rate was not rejected.");

  const assetA = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, code: `FA-A-${run}`, name: `Acceptance Single Month ${run}`, purchaseCost: "50000.0000", usefulLifeMonths: 1 }), expected: 201 });
  const assetB = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, code: `FA-B-${run}`, name: `Acceptance Declining ${run}`, purchaseCost: "12000.0000", usefulLifeMonths: 60, depreciationMethod: "DECLINING_BALANCE", depreciationRate: "24" }), expected: 201 });
  const assetC = await request(accountant, "/api/finance/assets", { method: "POST", body: assetBody({ categoryId: category.data.id, code: `FA-C-${run}`, name: `Acceptance Disposal ${run}`, purchaseCost: "5000.0000", usefulLifeMonths: 60 }), expected: 201 });
  for (const asset of [assetA, assetB, assetC]) {
    assert(asset.data.status === "DRAFT", `Asset ${asset.data.code} was not created as a draft.`);
    const posted = await prisma.journalEntry.count({ where: { companyId: company.id, sourceModule: "FIXED_ASSET", sourceDocumentId: asset.data.id } });
    assert(posted === 0, `Draft asset ${asset.data.code} posted ${posted} journal(s).`);
  }
  const draftTransactionCount = await prisma.assetTransaction.count({ where: { assetId: { in: [assetA.data.id, assetB.data.id, assetC.data.id] } } });
  assert(draftTransactionCount === 0, "Draft assets recorded ledger transactions.");
  console.log("✓ drafts validate cost, residual, and depreciation policy without touching the ledger");

  // 4 · draft edit then mapping lock ------------------------------------------
  const edited = await request(accountant, `/api/finance/assets/${assetC.data.id}`, { method: "PATCH", body: assetBody({ categoryId: category.data.id, code: `FA-C-${run}`, name: `Acceptance Disposal ${run}`, purchaseCost: "5000.0000", usefulLifeMonths: 60, assetLocation: "Hazro service desk" }) });
  assert(edited.data.assetLocation === "Hazro service desk", "Draft asset edit did not persist.");
  const lockedMapping = await request(accountant, `/api/finance/asset-categories/${category.data.id}`, { method: "PATCH", body: { ...categoryBody, assetAccountId: inventoryAccount.id }, expected: 409 });
  assert(/locked/i.test(JSON.stringify(lockedMapping)), "Category ledger mapping was not locked after first use.");
  console.log("✓ drafts stay editable while category ledger mapping locks after first use");

  // 5 · capitalization posts the acquisition journal --------------------------
  await request(controller, `/api/finance/assets/${assetA.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: equipmentAtCost.id }, expected: 422 });
  const selfCapitalized = await request(accountant, `/api/finance/assets/${assetA.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: cash.id }, expected: 409 });
  assert(/independent|cannot/i.test(JSON.stringify(selfCapitalized)), "A draft preparer was allowed to capitalize their own asset.");
  const capitalizedA = await request(controller, `/api/finance/assets/${assetA.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: cash.id, postingDate: day(-2) } });
  assert(capitalizedA.data.asset.status === "ACTIVE", "Capitalized asset did not become active.");
  assert(money(capitalizedA.data.asset.netBookValue) === 50000, `Capitalized net book value was ${capitalizedA.data.asset.netBookValue}.`);
  const capitalizedB = await request(controller, `/api/finance/assets/${assetB.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: cash.id, postingDate: day(-2) } });
  const capitalizedC = await request(controller, `/api/finance/assets/${assetC.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: cash.id, postingDate: day(-2) } });

  const acqA = await journalLines(capitalizedA.data.journal.id);
  assert(acqA.journal.sourceModule === "FIXED_ASSET" && acqA.journal.sourceDocumentType === "FIXED_ASSET_CAPITALIZATION", "Acquisition journal was not tagged as a fixed-asset document.");
  assert(acqA.journal.status === "POSTED", "Acquisition journal was not posted immediately.");
  assert(acqA.debitTotal === acqA.creditTotal, "Acquisition journal was not balanced.");
  assert(acqA.lines.some((line) => line.code === "1500" && line.debit === 50000), "Acquisition did not debit the asset cost account.");
  assert(acqA.lines.some((line) => line.code === "1000" && line.credit === 50000), "Acquisition did not credit the settlement account.");
  await request(controller, `/api/finance/assets/${assetA.data.id}/capitalize`, { method: "POST", body: { settlementAccountId: cash.id }, expected: 409 });
  await request(accountant, `/api/finance/assets/${assetA.data.id}`, { method: "PATCH", body: assetBody({ categoryId: category.data.id, code: `FA-A-${run}`, purchaseCost: "1.0000" }), expected: 409 });
  const preparerJournal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: capitalizedA.data.journal.id } });
  const preparer = await prisma.user.findUniqueOrThrow({ where: { email: "accountant@axonmobile.local" } });
  const posterUser = await prisma.user.findUniqueOrThrow({ where: { email: "controller@axonmobile.local" } });
  assert(preparerJournal.preparedById === preparer.id && preparerJournal.approvedById === posterUser.id && preparerJournal.postedById === posterUser.id, "Acquisition journal did not record a distinct preparer and posting officer.");
  console.log(`✓ an independent officer must post the acquisition (Dr 1500 / Cr 1000 via ${acqA.journal.voucherNumber}); capitalized assets lock from edits and re-capitalization`);

  const capitalizedNetBook = { a: money(capitalizedA.data.asset.netBookValue), b: money(capitalizedB.data.asset.netBookValue), c: money(capitalizedC.data.asset.netBookValue) };
  void capitalizedNetBook;

  // 6 · depreciation generation and idempotency -------------------------------
  const periodDate = `${day().slice(0, 7)}-01`;
  const periodMonth = day().slice(0, 7);
  const generated = await request(accountant, "/api/finance/assets/depreciation/generate", { method: "POST", body: { periodDate, categoryId: category.data.id } });
  assert(generated.data.created === 3, `Depreciation generation created ${generated.data.created} rows, expected 3.`);
  const regenerated = await request(accountant, "/api/finance/assets/depreciation/generate", { method: "POST", body: { periodDate, categoryId: category.data.id } });
  assert(regenerated.data.created === 0, "Re-generating the same month duplicated schedule rows.");
  const scheduleList = await request(accountant, `/api/finance/assets/depreciation?period=${periodMonth}`);
  const ownSchedules = scheduleList.data.filter((row: Row) => [assetA.data.id, assetB.data.id, assetC.data.id].includes(row.assetId));
  assert(ownSchedules.length === 3, `Schedule list returned ${ownSchedules.length} acceptance rows, expected 3.`);
  const scheduleA = ownSchedules.find((row: Row) => row.assetId === assetA.data.id);
  const scheduleB = ownSchedules.find((row: Row) => row.assetId === assetB.data.id);
  const scheduleC = ownSchedules.find((row: Row) => row.assetId === assetC.data.id);
  assert(scheduleA && scheduleB && scheduleC, "A generated schedule row is missing.");
  assert(money(scheduleA.depreciationAmount) === 50000, `Straight-line single-month schedule was ${scheduleA.depreciationAmount}, expected 50000.`);
  assert(money(scheduleB.depreciationAmount) === 240, `Declining-balance schedule was ${scheduleB.depreciationAmount}, expected 240 (2% of 12000).`);
  assert(money(scheduleC.depreciationAmount) === 83.3333, `Straight-line 60-month schedule was ${scheduleC.depreciationAmount}, expected 83.3333.`);
  console.log("✓ monthly schedules are generated once per asset (straight line and declining balance) and re-runs are idempotent");

  // 7 · posting depreciation --------------------------------------------------
  await request(accountant, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate } , expected: 403 });
  const posted = await request(poster, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate, scheduleIds: [scheduleA.id, scheduleB.id, scheduleC.id] } });
  assert(posted.data.posted === 3, `Posted ${posted.data.posted} depreciation journals, expected 3.`);
  await request(poster, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate, scheduleIds: [scheduleA.id] }, expected: 409 });

  const depreciationJournalA = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: company.id, sourceDocumentType: "ASSET_DEPRECIATION", sourceDocumentId: scheduleA.id } });
  const depLinesA = await journalLines(depreciationJournalA.id);
  assert(depLinesA.lines.some((line) => line.code === "6100" && line.debit === 50000), "Depreciation did not debit the expense account.");
  assert(depLinesA.lines.some((line) => line.code === "1510" && line.credit === 50000), "Depreciation did not credit accumulated depreciation.");
  assert(depLinesA.debitTotal === depLinesA.creditTotal, "Depreciation journal was not balanced.");

  const afterA = await prisma.fixedAsset.findUniqueOrThrow({ where: { id: assetA.data.id } });
  const afterB = await prisma.fixedAsset.findUniqueOrThrow({ where: { id: assetB.data.id } });
  assert(afterA.status === "FULLY_DEPRECIATED", `One-month asset ended as ${afterA.status}.`);
  assert(money(afterA.netBookValue) === 0, `Fully depreciated asset retained net book value ${afterA.netBookValue}.`);
  assert(money(afterB.netBookValue) === 11760, `Declining-balance asset net book value was ${afterB.netBookValue}, expected 11760.`);
  assert(money(afterB.accumulatedDepreciation) === 240, `Declining-balance accumulated depreciation was ${afterB.accumulatedDepreciation}.`);
  const postedScheduleA = await prisma.assetDepreciationSchedule.findUniqueOrThrow({ where: { id: scheduleA.id } });
  assert(postedScheduleA.status === "POSTED" && postedScheduleA.journalEntryId === depreciationJournalA.id, "Schedule row was not marked posted against its journal.");
  console.log(`✓ posting capitalized depreciation journals per asset (${posted.data.vouchers.slice(0, 3).join(", ")}) and fully-depreciated assets transition correctly`);

  // 8 · disposal of a fully posted asset ---------------------------------------
  await request(accountant, `/api/finance/assets/${assetC.data.id}/dispose`, { method: "POST", body: { disposalDate: day(), method: "SALE", proceeds: "0", proceedsAccountId: null, reason: "Acceptance disposal attempt" }, expected: 403 });
  await request(controller, `/api/finance/assets/${assetC.data.id}/dispose`, { method: "POST", body: { disposalDate: day(), method: "SALE", proceeds: "3000.0000", proceedsAccountId: null, reason: "Acceptance disposal without a proceeds account" }, expected: 422 });
  const disposed = await request(controller, `/api/finance/assets/${assetC.data.id}/dispose`, { method: "POST", body: { disposalDate: day(), method: "SALE", proceeds: "3000.0000", proceedsAccountId: cash.id, reason: `Acceptance sale of retired showroom equipment ${run}` } });
  assert(disposed.data.asset.status === "DISPOSED", "Disposed asset did not move to DISPOSED.");
  assert(money(disposed.data.asset.netBookValue) === 0, "Disposed asset retained net book value.");
  const expectedGain = 3000 - (5000 - 83.3333);
  assert(Math.abs(money(disposed.data.gainOrLoss) - expectedGain) < 0.0002, `Recorded gain/loss was ${disposed.data.gainOrLoss}, expected ${expectedGain}.`);
  const disposalJournal = await journalLines(disposed.data.journal.id);
  assert(disposalJournal.debitTotal === disposalJournal.creditTotal, "Disposal journal was not balanced.");
  assert(disposalJournal.lines.some((line) => line.code === "1510" && line.debit === 83.3333), "Disposal did not reverse the accumulated depreciation.");
  assert(disposalJournal.lines.some((line) => line.code === "1500" && line.credit === 5000), "Disposal did not retire the asset cost.");
  assert(disposalJournal.lines.some((line) => line.code === "1000" && line.debit === 3000), "Disposal did not record proceeds in the settlement account.");
  assert(disposalJournal.lines.some((line) => line.code === "6400" && line.debit === 1916.6667), "Disposal did not post the loss to the gain/loss account.");
  await request(controller, `/api/finance/assets/${assetC.data.id}/dispose`, { method: "POST", body: { disposalDate: day(), method: "SALE", proceeds: "0", proceedsAccountId: null, reason: "Acceptance duplicate disposal attempt" }, expected: 409 });
  console.log(`✓ disposal values gain or loss on net book value, reverses cost and accumulated depreciation, and rejects a second disposal (${disposalJournal.journal.voucherNumber})`);

  // 9 · next month generation, planned-disposal block, and self-posting block --
  const nextPeriod = new Date(Date.UTC(Number(periodMonth.slice(0, 4)), Number(periodMonth.slice(5, 7)) + 1, 0));
  const nextMonth = nextPeriod.toISOString().slice(0, 7);
  const nextGenerated = await request(owner, "/api/finance/assets/depreciation/generate", { method: "POST", body: { periodDate: `${nextMonth}-01`, categoryId: category.data.id } });
  const nextSchedules = await request(accountant, `/api/finance/assets/depreciation?period=${nextMonth}`);
  assert(nextGenerated.data.created === 1, `Next month generated ${nextGenerated.data.created} rows, expected only the declining-balance asset.`);
  const nextB = nextSchedules.data.find((row: Row) => row.assetId === assetB.data.id);
  assert(nextB, "Next month schedule for the declining-balance asset is missing.");
  assert(money(nextB.depreciationAmount) === 235.2, `Second declining-balance charge was ${nextB.depreciationAmount}, expected 235.2.`);
  const blockedDisposal = await request(controller, `/api/finance/assets/${assetB.data.id}/dispose`, { method: "POST", body: { disposalDate: day(), method: "SALE", proceeds: "0", proceedsAccountId: null, reason: "Acceptance disposal attempt while planned" }, expected: 409 });
  assert(/planned/i.test(JSON.stringify(blockedDisposal)), "Disposal with planned depreciation was not blocked.");
  const selfPosted = await request(owner, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate: `${nextMonth}-01`, scheduleIds: [nextB.id] }, expected: 409 });
  assert(/cannot post|independent/i.test(JSON.stringify(selfPosted)), "The schedule generator was allowed to post their own depreciation.");
  const nextPosted = await request(poster, "/api/finance/assets/depreciation/post", { method: "POST", body: { periodDate: `${nextMonth}-01`, scheduleIds: [nextB.id] } });
  assert(nextPosted.data.posted === 1, `Posting next-month depreciation applied ${nextPosted.data.posted} schedules.`);
  const afterNextB = await prisma.fixedAsset.findUniqueOrThrow({ where: { id: assetB.data.id } });
  assert(money(afterNextB.netBookValue) === 11524.8, `Second-month net book value was ${afterNextB.netBookValue}, expected 11524.8.`);
  console.log("✓ next-month generation skips fully depreciated assets, planned depreciation blocks disposal, and a generator cannot post their own schedules");

  // 10 · subledger reconciliation ---------------------------------------------
  const assets = await prisma.fixedAsset.findMany({ where: { id: { in: [assetA.data.id, assetB.data.id, assetC.data.id] } } });
  const assetIds = assets.map((asset) => asset.id);
  const scheduleIds = (await prisma.assetDepreciationSchedule.findMany({ where: { assetId: { in: assetIds } }, select: { id: true } })).map((row) => row.id);
  const journals = await prisma.journalEntry.findMany({
    where: {
      companyId: company.id,
      sourceModule: "FIXED_ASSET",
      OR: [
        { sourceDocumentType: "FIXED_ASSET_CAPITALIZATION", sourceDocumentId: { in: assetIds } },
        { sourceDocumentType: "FIXED_ASSET_DISPOSAL", sourceDocumentId: { in: assetIds } },
        { sourceDocumentType: "ASSET_DEPRECIATION", sourceDocumentId: { in: scheduleIds } },
      ],
    },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  const ledgerCost = journals.flatMap((journal) => journal.lines).filter((line) => line.account.code === "1500").reduce((sum, line) => sum + money(line.debit) - money(line.credit), 0);
  const subledgerCost = assets.filter((asset) => asset.status !== "DISPOSED").reduce((sum, asset) => sum + money(asset.purchaseCost) + money(asset.additionalCost), 0);
  assert(Math.abs(ledgerCost - subledgerCost) < 0.0001, `Cost account balance ${ledgerCost} does not reconcile to the live subledger ${subledgerCost}.`);
  const ledgerAccumulated = journals.flatMap((journal) => journal.lines).filter((line) => line.account.code === "1510").reduce((sum, line) => sum + money(line.credit) - money(line.debit), 0);
  const subledgerAccumulated = assets.filter((asset) => asset.status !== "DISPOSED").reduce((sum, asset) => sum + money(asset.accumulatedDepreciation), 0);
  assert(Math.abs(ledgerAccumulated - subledgerAccumulated) < 0.0001, `Accumulated depreciation ${ledgerAccumulated} does not reconcile to the subledger ${subledgerAccumulated}.`);
  console.log("✓ posted cost and accumulated depreciation reconcile to the asset subledger");

  // 11 · audit and workspace --------------------------------------------------
  const audit = await prisma.auditLog.findMany({
    where: {
      companyId: company.id,
      createdAt: { gte: startedAt },
      OR: [
        { entityId: { in: [category.data.id, assetA.data.id, assetB.data.id, assetC.data.id] } },
        { action: { in: ["ASSET_DEPRECIATION_GENERATED", "ASSET_DEPRECIATION_POSTED"] } },
      ],
    },
    select: { action: true },
  });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["ASSET_CATEGORY_CREATED", "FIXED_ASSET_DRAFT_CREATED", "FIXED_ASSET_CAPITALIZED", "FIXED_ASSET_DISPOSED", "ASSET_DEPRECIATION_GENERATED", "ASSET_DEPRECIATION_POSTED"]) {
    assert(actions.has(action), `Missing fixed-asset audit event ${action}.`);
  }
  const page = await request(accountant, "/finance/assets");
  const pageText = String(typeof page === "string" ? page : (page as Row).raw ?? JSON.stringify(page));
  assert(/Fixed assets|Asset register|Categories/i.test(pageText), `Asset workspace did not render: ${pageText.slice(0, 200)}`);
  const register = await request(accountant, "/api/finance/assets");
  assert(register.data.some((row: Row) => row.id === assetA.data.id), "Register API did not return the acceptance assets.");
  console.log(`✓ audit evidence and authenticated asset workspace rendered (${run})`);

  const retained = await prisma.fixedAsset.findMany({ where: { id: { in: [assetA.data.id, assetB.data.id, assetC.data.id] } }, select: { code: true, status: true, netBookValue: true } });
  console.log(`· retained asset evidence: ${retained.map((asset) => `${asset.code}=${asset.status}:${new Prisma.Decimal(asset.netBookValue).toFixed(2)}`).join(", ")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});
