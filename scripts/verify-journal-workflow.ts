import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.FINANCE_TEST_BASE_URL || "http://127.0.0.1:3000";
const password = process.env.FINANCE_TEST_PASSWORD;
if (!password) throw new Error("FINANCE_TEST_PASSWORD is required.");

type Session = { cookie: string; userAgent: string };

async function login(email: string): Promise<Session> {
  const userAgent = `Axon-Finance-Control-Test/${email}`;
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": userAgent },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status} ${await response.text()}`);
  const setCookie = response.headers.get("set-cookie") || "";
  const token = setCookie.match(/axon_session=([^;,]+)/)?.[1];
  if (!token) throw new Error(`Session cookie missing for ${email}.`);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function request(session: Session, path: string, options: RequestInit = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Cookie: session.cookie,
      "User-Agent": session.userAgent,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}: ${text}`);
  return body;
}

async function main() {
  const [accountant, controller, poster] = await Promise.all([
    login("accountant@axonmobile.local"),
    login("controller@axonmobile.local"),
    login("poster@axonmobile.local"),
  ]);
  console.log("✓ exact-role users authenticated");

  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, code: "HZR" } });
  const [expense, cash] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "6000" } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "1000" } } }),
  ]);
  const idempotencyKey = "FINANCE-WORKFLOW-20261027-01";
  let journal = await prisma.journalEntry.findUnique({
    where: { companyId_sourceModule_idempotencyKey: { companyId: company.id, sourceModule: "MANUAL", idempotencyKey } },
  });
  if (!journal) {
    const created = await request(
      accountant,
      "/api/finance/journals",
      {
        method: "POST",
        body: JSON.stringify({
          branchId: branch.id,
          postingDate: "2026-10-27",
          voucherType: "GENERAL",
          cashFlowActivity: "OPERATING",
          narration: "Automated finance workflow verification; reversed after control checks",
          referenceDocument: "FINANCE-CONTROL-TEST",
          idempotencyKey,
          lines: [
            { accountId: expense.id, description: "Temporary workflow verification expense", debit: "1234.5600", credit: "0" },
            { accountId: cash.id, description: "Temporary workflow verification cash", debit: "0", credit: "1234.5600" },
          ],
        }),
      },
      201,
    );
    journal = created.data;
    const createdJournalId = created.data.id as string;
    console.log("✓ accountant created balanced draft");

    const duplicate = await request(
      accountant,
      "/api/finance/journals",
      {
        method: "POST",
        body: JSON.stringify({
          branchId: branch.id,
          postingDate: "2026-10-27",
          voucherType: "GENERAL",
          cashFlowActivity: "OPERATING",
          narration: "Automated finance workflow verification; reversed after control checks",
          referenceDocument: "FINANCE-CONTROL-TEST",
          idempotencyKey,
          lines: [
            { accountId: expense.id, description: "Temporary workflow verification expense", debit: "1234.5600", credit: "0" },
            { accountId: cash.id, description: "Temporary workflow verification cash", debit: "0", credit: "1234.5600" },
          ],
        }),
      },
      201,
    );
    if (duplicate.data.id !== createdJournalId) throw new Error("Idempotent retry returned a different journal.");
    console.log("✓ duplicate create returned the original journal");
  }
  if (!journal) throw new Error("Journal workflow fixture could not be created or loaded.");

  if (journal.status === "DRAFT") {
    await request(accountant, `/api/finance/journals/${journal.id}/submit`, { method: "POST" });
    console.log("✓ preparer submitted draft");
    await request(accountant, `/api/finance/journals/${journal.id}/approve`, { method: "POST" }, 403);
    console.log("✓ preparer lacked approval authority");
    journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } });
  }
  if (journal.status === "SUBMITTED") {
    await request(controller, `/api/finance/journals/${journal.id}/approve`, { method: "POST" });
    console.log("✓ independent controller approved journal");
    await request(controller, `/api/finance/journals/${journal.id}/post`, { method: "POST" }, 403);
    console.log("✓ approver lacked posting authority");
    journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } });
  }
  if (journal.status === "APPROVED") {
    await request(poster, `/api/finance/journals/${journal.id}/post`, { method: "POST" });
    console.log("✓ third-role officer posted journal");
    journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id } });
  }
  if (journal.status === "POSTED") {
    const reversed = await request(poster, `/api/finance/journals/${journal.id}/reverse`, {
      method: "POST",
      body: JSON.stringify({
        postingDate: "2026-10-27",
        reason: "Complete the automated control test with an auditable zero-net reversal",
        idempotencyKey: "FINANCE-WORKFLOW-REVERSAL-20261027-01",
      }),
    });
    console.log(`✓ linked reversal ${reversed.data.voucherNumber} posted`);
  }

  const original = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journal.id }, include: { lines: true, reversals: { include: { lines: true } } } });
  if (original.status !== "REVERSED" || original.reversals.length !== 1 || original.reversals[0].status !== "POSTED") {
    throw new Error("Original/reversal state is invalid.");
  }
  const net = [...original.lines, ...original.reversals[0].lines].reduce(
    (sum, line) => sum + BigInt(line.baseDebit.toFixed(4).replace(".", "")) - BigInt(line.baseCredit.toFixed(4).replace(".", "")),
    0n,
  );
  if (net !== 0n) throw new Error("Original and reversal do not net to zero.");
  const audits = await prisma.auditLog.count({ where: { entityType: "JournalEntry", OR: [{ entityId: original.id }, { entityId: original.reversals[0].id }] } });
  if (audits < 5) throw new Error("Expected journal workflow audit events are missing.");
  console.log("✓ original remains immutable, linked reversal nets to zero, and audit custody is present");
  console.log("Journal workflow verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
