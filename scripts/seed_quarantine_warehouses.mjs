import { PrismaClient, WarehouseType } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  if (!company) throw new Error("AXON not found");

  const branches = await prisma.branch.findMany({ where: { companyId: company.id } });

  for (const branch of branches) {
    const code = `${branch.code}-QUARANTINE`;
    const existing = await prisma.warehouse.findFirst({
      where: { companyId: company.id, code },
    });
    if (!existing) {
      const created = await prisma.warehouse.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          code,
          name: `${branch.name} Quarantine & Damaged`,
          type: WarehouseType.QUARANTINE,
          allowReceiving: true,
          allowDispatch: false,
          isActive: true,
        },
      });
      console.log(`Created quarantine warehouse: ${created.code} (${created.id})`);
    } else {
      console.log(`Quarantine warehouse already exists: ${existing.code}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
