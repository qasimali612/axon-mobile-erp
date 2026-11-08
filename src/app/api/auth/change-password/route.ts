import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { hashPassword, requireAuth, verifyPassword } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { checkPasswordPolicy } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const input = schema.parse(await request.json());
    const policy = checkPasswordPolicy(input.newPassword);
    if (!policy.valid) throw new ApiError(422, "WEAK_PASSWORD", policy.errors.join(" "));
    if (input.currentPassword === input.newPassword) {
      throw new ApiError(422, "PASSWORD_REUSED", "Choose a password different from the current one.");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.user.id } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new ApiError(401, "INVALID_PASSWORD", "Current password is incorrect.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          passwordChangedAt: new Date(),
          forcePasswordChange: false,
        },
      });
      await tx.session.updateMany({
        where: { userId: user.id, id: { not: context.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: user.id,
          action: "PASSWORD_CHANGED",
          module: "access",
          entityType: "User",
          entityId: user.id,
          entityReference: user.email,
          metadata: { otherSessionsRevoked: true },
        },
        tx,
      );
    });

    return NextResponse.json({ data: { changed: true } });
  } catch (error) {
    return apiError(error);
  }
}
