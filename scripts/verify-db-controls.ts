import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function expectRejected(label: string, operation: () => Promise<unknown>) {
  try {
    await operation();
    throw new Error(`${label}: operation unexpectedly succeeded`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("unexpectedly succeeded")) throw error;
    console.log(`✓ ${label}`);
  }
}

async function main() {
  const audit = await prisma.auditLog.findFirstOrThrow();
  await expectRejected("AuditLog UPDATE is rejected", () =>
    prisma.auditLog.update({ where: { id: audit.id }, data: { reason: "must fail" } }),
  );
  await expectRejected("AuditLog DELETE is rejected", () =>
    prisma.auditLog.delete({ where: { id: audit.id } }),
  );

  const postedJournal = await prisma.journalEntry.findFirstOrThrow({ where: { status: "POSTED" } });
  const postedLine = await prisma.journalEntryLine.findFirstOrThrow({ where: { entryId: postedJournal.id } });
  await expectRejected("posted JournalEntry content UPDATE is rejected", () =>
    prisma.journalEntry.update({ where: { id: postedJournal.id }, data: { narration: "must fail" } }),
  );
  await expectRejected("posted JournalEntry DELETE is rejected", () =>
    prisma.journalEntry.delete({ where: { id: postedJournal.id } }),
  );
  await expectRejected("posted JournalEntryLine UPDATE is rejected", () =>
    prisma.journalEntryLine.update({ where: { id: postedLine.id }, data: { description: "must fail" } }),
  );
  await expectRejected("posted JournalEntryLine DELETE is rejected", () =>
    prisma.journalEntryLine.delete({ where: { id: postedLine.id } }),
  );

  const branch = await prisma.branch.findFirstOrThrow();
  const membership = await prisma.companyMembership.findFirstOrThrow({
    where: { companyId: branch.companyId },
  });
  const other = await prisma.company.create({
    data: { code: `CTRL${Date.now().toString().slice(-8)}`, name: "Transient control verification" },
  });
  const foreignRole = await prisma.role.create({
    data: { companyId: other.id, code: "TRANSIENT", name: "Transient role" },
  });
  try {
    await expectRejected("cross-company Warehouse → Branch is rejected", () =>
      prisma.warehouse.create({
        data: {
          companyId: other.id,
          branchId: branch.id,
          code: "INVALID-CROSS-SCOPE",
          name: "Must not exist",
          type: "MAIN",
        },
      }),
    );
    await expectRejected("cross-company UserRole assignment is rejected", () =>
      prisma.userRole.create({
        data: { membershipId: membership.id, roleId: foreignRole.id },
      }),
    );
  } finally {
    await prisma.role.delete({ where: { id: foreignRole.id } });
    await prisma.company.delete({ where: { id: other.id } });
  }

  console.log("Database control verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
