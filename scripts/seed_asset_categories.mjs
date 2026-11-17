const cloudUrl = 'postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30';
process.env.DATABASE_URL = cloudUrl;

import { PrismaClient, DepreciationMethod } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({ where: { code: 'AXON' } });
  if (!company) throw new Error('Company AXON not found');

  const [assetAccount, accumAccount, expAccount, dispAccount] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '1500' } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '1510' } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '6100' } } }),
    prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '6400' } } }),
  ]);

  const categories = [
    { code: 'FURN', name: 'Furniture & Fixtures', usefulLife: 60 },
    { code: 'IT-EQUIP', name: 'Computer & IT Equipment', usefulLife: 36 },
    { code: 'OFF-EQUIP', name: 'Office Equipment', usefulLife: 48 },
    { code: 'SHOP-EQUIP', name: 'Shop Equipment', usefulLife: 60 },
    { code: 'ELEC-EQUIP', name: 'Electrical Equipment', usefulLife: 36 },
    { code: 'SEC-EQUIP', name: 'Security Equipment', usefulLife: 36 },
    { code: 'VEHICLES', name: 'Vehicles', usefulLife: 60 },
    { code: 'OTHER-FA', name: 'Other Fixed Assets', usefulLife: 60 },
  ];

  for (const cat of categories) {
    const existing = await prisma.assetCategory.findFirst({
      where: { companyId: company.id, code: cat.code }
    });
    if (!existing) {
      await prisma.assetCategory.create({
        data: {
          companyId: company.id,
          code: cat.code,
          name: cat.name,
          depreciable: true,
          defaultUsefulLifeMonths: cat.usefulLife,
          defaultMethod: DepreciationMethod.STRAIGHT_LINE,
          assetAccountId: assetAccount.id,
          accumulatedAccountId: accumAccount.id,
          expenseAccountId: expAccount.id,
          disposalAccountId: dispAccount.id,
          isActive: true
        }
      });
      console.log(`Created asset category: ${cat.code} (${cat.name})`);
    } else {
      console.log(`Asset category already exists: ${cat.code}`);
    }
  }

  // Also verify permissions STAFF_VIEW, STAFF_CREATE, STAFF_UPDATE exist
  const staffPermKeys = [
    { key: 'STAFF_VIEW', module: 'staff', action: 'view', description: 'View staff directory and profiles' },
    { key: 'STAFF_CREATE', module: 'staff', action: 'create', description: 'Create new staff records' },
    { key: 'STAFF_UPDATE', module: 'staff', action: 'update', description: 'Update staff records and assignments' },
  ];

  for (const p of staffPermKeys) {
    const existing = await prisma.permission.findUnique({ where: { key: p.key } });
    if (!existing) {
      await prisma.permission.create({
        data: {
          key: p.key,
          module: p.module,
          action: p.action,
          description: p.description,
          isSensitive: false
        }
      });
      console.log(`Created permission: ${p.key}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

