import { PrismaClient } from "@prisma/client";
const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

const items = [
  { name: 'Bouncer Pro', brand: 'Me Mobile' },
  { name: 'CALME CL888', brand: 'Callme' },
  { name: 'Candy', brand: 'Me Mobile' },
  { name: 'Club Mobile 113', brand: 'Clube Mobile' },
  { name: 'CLUB MOBILE MUSIC 3000 PRO', brand: 'Clube Mobile' },
  { name: 'Clube Mobile Blade 2.4"', brand: 'Clube Mobile' },
  { name: 'Clube Music 110', brand: 'Clube Mobile' },
  { name: 'Commando Me Mobile', brand: 'Me Mobile' },
  { name: 'DIGIT C1', brand: 'DIGIT' },
  { name: 'DIGIT C2', brand: 'DIGIT' },
  { name: 'DIGIT Neo', brand: 'DIGIT' },
  { name: 'E-550 Me Mobile', brand: 'Me Mobile' },
  { name: 'ET E500 LITE', brand: 'ETEL' },
  { name: 'GF-Solder 2.8" GFive', brand: 'G-Five' },
  { name: 'Grace Clube Mobile', brand: 'Clube Mobile' },
  { name: 'I-Touch Me Mobile', brand: 'Me Mobile' },
  { name: 'It2165 itel', brand: 'ITel' },
  { name: 'ITEL 2166', brand: 'ITel' },
  { name: 'Itel 2210 2.0"', brand: 'ITel' },
  { name: 'ITEL 5032', brand: 'ITel' },
  { name: 'Itel Muzik 300 2.4"', brand: 'ITel' },
  { name: 'ITEL R60+ 4G', brand: 'ITel' },
  { name: 'itel-2181', brand: 'ITel' },
  { name: 'Magic Power', brand: 'Me Mobile' },
  { name: 'Me Hero Me Mobile', brand: 'Me Mobile' },
  { name: 'Mega Power 2', brand: 'Me Mobile' },
  { name: 'Mega Power Me Mobile', brand: 'Me Mobile' },
  { name: 'NEX N101', brand: 'Nextel' },
  { name: 'Nokia 105 Power Advance', brand: 'Nokia' },
  { name: 'Nokia 106', brand: 'Nokia' },
  { name: 'Nokia 108', brand: 'Nokia' },
  { name: 'Platinum 2', brand: 'Me Mobile' },
  { name: 'Power 666 Club Mobile', brand: 'Clube Mobile' },
  { name: 'Power 666 Max', brand: 'Clube Mobile' },
  { name: 'Power Play', brand: 'Me Mobile' },
  { name: 'Q - BOOM 400', brand: 'QMobile' },
  { name: 'Q-101', brand: 'QMobile' },
  { name: 'Q-150S QMobile', brand: 'QMobile' },
  { name: 'Q-2165 Music QMobile', brand: 'QMobile' },
  { name: 'Q-E4 QMobile', brand: 'QMobile' },
  { name: 'Q-Hero QMobile', brand: 'QMobile' },
  { name: 'Q-Power 700 QMobile', brand: 'QMobile' },
  { name: 'Q-PRIME 2.4', brand: 'QMobile' },
  { name: 'Q150 Q Mobile', brand: 'QMobile' },
  { name: 'SEGO 105 TRUE 2.0', brand: 'SEGO' },
  { name: 'SEGO POWER 200', brand: 'SEGO' },
  { name: 'SEGO- MAGIC 6', brand: 'SEGO' },
  { name: 'Spark 3000', brand: 'Me Mobile' },
  { name: 'Super Hit Club Mobile', brand: 'Clube Mobile' },
  { name: 'Super Star Clube Mobile', brand: 'Clube Mobile' },
  { name: 'Valu 300 Plus Clube Mobile', brand: 'Clube Mobile' },
  { name: 'X-Battery ka Badshah Plus', brand: 'XMobile' },
  { name: 'XL-500 Me Mobile', brand: 'Me Mobile' },
  { name: 'XM - BATTERY KA SULTAN', brand: 'XMobile' },
  { name: 'XM - CHIEF 101', brand: 'XMobile' },
  { name: 'XM - MARSHAL 100 LITE', brand: 'XMobile' },
  { name: 'XM - PRIME 200', brand: 'XMobile' },
  { name: 'XM - RETRO 101 LITE', brand: 'XMobile' },
  { name: 'XM - RETRO 200 LITE', brand: 'XMobile' },
  { name: 'XM - SL100 PLUS LITE', brand: 'XMobile' },
  { name: 'XM - X2 SELFI', brand: 'XMobile' },
  { name: 'XM -RETRO 101', brand: 'XMobile' },
  { name: 'Yorker', brand: 'Me Mobile' }
];

function sanitizeSku(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 15);
}

async function main() {
  const company = await prisma.company.findFirst();
  const category = await prisma.productCategory.findFirst({
    where: { companyId: company.id, name: 'Mobile Phone' }
  });
  const unit = await prisma.unitOfMeasure.findFirst({
    where: { companyId: company.id, name: 'PCS' }
  });
  const user = await prisma.user.findFirst({
    where: { email: 'owner@axonmobile.local' }
  });

  console.log(`Company: ${company.name}, Category: ${category.name}, Unit: ${unit.name}`);

  // Resolve or create brands
  const existingBrands = await prisma.brand.findMany({
    where: { companyId: company.id }
  });

  const brandMap = new Map();
  for (const b of existingBrands) {
    brandMap.set(b.name.trim().toLowerCase(), b);
  }

  let brandCounter = existingBrands.length + 1;
  async function getOrCreateBrand(brandName) {
    const key = brandName.trim().toLowerCase();
    if (brandMap.has(key)) return brandMap.get(key);

    const code = `BRA-${String(brandCounter++).padStart(3, '0')}`;
    const newBrand = await prisma.brand.create({
      data: {
        companyId: company.id,
        name: brandName.trim(),
        code,
        isActive: true
      }
    });
    brandMap.set(key, newBrand);
    console.log(`Created new Brand: ${newBrand.name} (${newBrand.code})`);
    return newBrand;
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const brand = await getOrCreateBrand(item.brand);

    // Check if product already exists
    const existing = await prisma.product.findFirst({
      where: {
        companyId: company.id,
        name: { equals: item.name.trim(), mode: 'insensitive' }
      }
    });

    if (existing) {
      console.log(`Skipped (already exists): ${item.name}`);
      skippedCount++;
      continue;
    }

    const skuBase = `FP-${brand.code}-${sanitizeSku(item.name)}-${String(i + 1).padStart(3, '0')}`;
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        categoryId: category.id,
        brandId: brand.id,
        unitId: unit.id,
        createdById: user.id,
        sku: skuBase,
        name: item.name.trim(),
        model: item.name.trim(),
        description: `Feature Phone - Without IMEI (${brand.name})`,
        productType: 'FEATURE_PHONE',
        trackingMethod: 'QUANTITY',
        costingMethod: 'WEIGHTED_AVERAGE',
        standardPurchasePrice: 0,
        status: 'ACTIVE',
        variants: {
          create: {
            companyId: company.id,
            sku: `${skuBase}-STD`,
            name: 'Standard',
            color: 'Standard',
            networkType: '2G',
            simConfiguration: 'Dual SIM',
            regionVariant: 'Pakistan',
            purchasePrice: 0,
            retailPrice: 0,
            isActive: true
          }
        }
      }
    });

    console.log(`Created [${createdCount + 1}/${items.length}]: ${product.name} (SKU: ${product.sku}) - Brand: ${brand.name}`);
    createdCount++;
  }

  console.log(`\n========================================`);
  console.log(`Seeding complete: Created ${createdCount}, Skipped ${skippedCount}, Total items: ${items.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
