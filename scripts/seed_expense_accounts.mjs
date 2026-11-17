import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

const defaultExpenseAccounts = [
  { code: "6010", name: "Shop Rent Expense", description: "Store and retail shop rental expenditure" },
  { code: "6020", name: "Electricity & Utilities Expense", description: "Electricity, power, water and utility bills" },
  { code: "6030", name: "Internet & Telecom Expense", description: "Broadband internet, landline and mobile communications" },
  { code: "6040", name: "Salaries & Wages Expense", description: "Staff monthly salaries, commissions and overtime wages" },
  { code: "6050", name: "Transportation & Freight Expense", description: "Conveyance, fuel, freight and local transport" },
  { code: "6060", name: "Courier & Shipping Expense", description: "Courier dispatch, TCS/Leopards logistics and delivery fees" },
  { code: "6070", name: "Office & Store Supplies", description: "Thermal receipt rolls, packaging material and stationery" },
  { code: "6080", name: "Repair & Maintenance Expense", description: "Fixtures, furniture, computers and AC servicing" },
  { code: "6090", name: "Marketing & Advertising Expense", description: "Social media ads, printing brochures and promotional events" },
  { code: "6095", name: "Bank Charges & Fees", description: "Bank processing fees, cheque book and account maintenance" },
  { code: "6099", name: "Other Operating Expenses", description: "Sundry and miscellaneous general operating expenses" },
];

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: "3cc6f3ef-718e-4bd3-9531-3f1955011586" },
  });
  if (!company) throw new Error("Company AXON not found");

  const base6000 = await prisma.account.findFirst({
    where: { companyId: company.id, code: "6000" },
  });
  const groupId = base6000?.groupId || null;

  console.log(`Seeding default expense accounts for company ${company.name} (${company.id})...`);

  for (const acc of defaultExpenseAccounts) {
    const existing = await prisma.account.findFirst({
      where: { companyId: company.id, code: acc.code },
    });

    if (existing) {
      console.log(`Account ${acc.code} already exists: ${existing.name}`);
    } else {
      const created = await prisma.account.create({
        data: {
          companyId: company.id,
          groupId,
          code: acc.code,
          name: acc.name,
          accountClass: "EXPENSE",
          subclass: "Operating expenses",
          accountType: "GENERAL_EXPENSE",
          normalBalance: "DEBIT",
          cashFlowActivity: "OPERATING",
          allowManualJournal: true,
          isActive: true,
          description: acc.description,
        },
      });
      console.log(`Created account [${created.code}] ${created.name}`);
    }
  }
  console.log("Seeding complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
