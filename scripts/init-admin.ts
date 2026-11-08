import { PrismaClient, MembershipStatus, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../src/lib/permissions";
import { checkPasswordPolicy } from "../src/lib/password-policy";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const companyCode = process.env.ADMIN_COMPANY_CODE?.trim().toUpperCase();
  const companyName = process.env.ADMIN_COMPANY_NAME?.trim();

  if (!email || !name || !password || !companyCode || !companyName) {
    throw new Error(
      "ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_COMPANY_CODE, and ADMIN_COMPANY_NAME are required.",
    );
  }

  const passwordCheck = checkPasswordPolicy(password);
  if (!passwordCheck.valid) throw new Error(passwordCheck.errors.join(" "));

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("That email already exists. The bootstrap command never resets an existing password.");
  }

  await prisma.$transaction(async (tx) => {
    for (const permission of PERMISSIONS) {
      await tx.permission.upsert({
        where: { key: permission.key },
        create: {
          key: permission.key,
          module: permission.module,
          action: permission.action,
          description: permission.description,
          isSensitive: permission.sensitive ?? false,
        },
        update: {},
      });
    }

    const company = await tx.company.upsert({
      where: { code: companyCode },
      create: { code: companyCode, name: companyName },
      update: {},
    });

    const role = await tx.role.upsert({
      where: { companyId_code: { companyId: company.id, code: "OWNER" } },
      create: {
        companyId: company.id,
        code: "OWNER",
        name: "Owner / Director",
        description: "Initial owner with full company authority.",
        isSystem: true,
      },
      update: {},
    });

    const permissions = await tx.permission.findMany({ select: { id: true } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });

    const user = await tx.user.create({
      data: {
        email,
        fullName: name,
        passwordHash: await bcrypt.hash(password, 12),
        status: UserStatus.ACTIVE,
        forcePasswordChange: true,
        passwordChangedAt: new Date(),
      },
    });

    const membership = await tx.companyMembership.create({
      data: {
        companyId: company.id,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        isOwner: true,
        jobTitle: "Owner / Director",
      },
    });
    await tx.userRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: "ADMIN_BOOTSTRAPPED",
        module: "access",
        entityType: "User",
        entityId: user.id,
        entityReference: email,
        newValues: { role: role.code, forcePasswordChange: true },
        metadata: { source: "admin:init" },
      },
    });
  });

  console.log(`Owner ${email} created. Remove ADMIN_PASSWORD from the environment now.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
