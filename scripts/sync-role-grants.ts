import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions";
import { grantsForRole } from "../src/lib/role-grants";

const prisma = new PrismaClient();

/**
 * Idempotent permission catalog and role grant synchronization.
 * Adds missing permission definitions and missing grants; never removes an existing grant.
 */
async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: { key: permission.key, module: permission.module, action: permission.action, description: permission.description, isSensitive: permission.sensitive ?? false },
      update: { module: permission.module, action: permission.action, description: permission.description, isSensitive: permission.sensitive ?? false },
    });
  }
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
  const roles = await prisma.role.findMany({ select: { id: true, code: true, companyId: true } });
  let added = 0;
  for (const role of roles) {
    const existing = new Set((await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } })).map((row) => row.permissionId));
    const missing = (grantsForRole(role.code) || [])
      .map((key) => byKey.get(key))
      .filter((permissionId): permissionId is string => Boolean(permissionId) && !existing.has(permissionId!));
    if (!missing.length) continue;
    await prisma.rolePermission.createMany({ data: missing.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
    added += missing.length;
    console.log(`✓ ${role.code}: ${missing.length} grant(s) added`);
  }
  console.log(`Permission catalog synchronized (${PERMISSIONS.length} definitions, ${added} new grants).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
