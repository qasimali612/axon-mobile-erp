import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  if (!company) throw new Error("Company AXON not found");

  const codes = ["HZR-MAIN", "ISB-RETAIL", "ISB-QUARANTINE", "HZR-QUARANTINE"];
  for (const code of codes) {
    const updated = await prisma.warehouse.updateMany({
      where: { companyId: company.id, code },
      data: { isActive: true },
    });
    console.log(`Activated warehouse ${code}: count = ${updated.count}`);
  }

  const all = await prisma.warehouse.findMany({ where: { companyId: company.id } });
  for (const w of all) {
    console.log(`Warehouse ${w.code}: isActive=${w.isActive}, allowReceiving=${w.allowReceiving}, allowDispatch=${w.allowDispatch}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

