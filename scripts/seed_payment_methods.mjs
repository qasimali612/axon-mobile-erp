const cloudUrl = 'postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30';
process.env.DATABASE_URL = cloudUrl;

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({ where: { code: 'AXON' } });
  if (!company) throw new Error('Company AXON not found');

  const cashAccount = await prisma.account.findUniqueOrThrow({
    where: { companyId_code: { companyId: company.id, code: '1000' } },
  });

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { companyId: company.id, code: '0001' },
  });

  const methods = [
    {
      code: 'CASH',
      name: 'Cash Payment',
      methodType: 'CASH',
      cashAccountId: cashAccount.id,
      bankAccountId: null,
      requiresReference: false,
      sequence: 1,
    },
    {
      code: 'BANK',
      name: 'Bank Transfer / Cheque',
      methodType: 'BANK',
      cashAccountId: null,
      bankAccountId: bankAccount?.id || null,
      requiresReference: true,
      sequence: 2,
    },
  ];

  for (const m of methods) {
    const existing = await prisma.paymentMethod.findFirst({
      where: { companyId: company.id, code: m.code },
    });
    if (!existing) {
      await prisma.paymentMethod.create({
        data: {
          companyId: company.id,
          code: m.code,
          name: m.name,
          methodType: m.methodType,
          cashAccountId: m.cashAccountId,
          bankAccountId: m.bankAccountId,
          requiresReference: m.requiresReference,
          sequence: m.sequence,
          isActive: true,
        },
      });
      console.log(`Created PaymentMethod: ${m.code} (${m.name})`);
    } else {
      console.log(`PaymentMethod already exists: ${m.code}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

