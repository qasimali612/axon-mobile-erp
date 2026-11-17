import { NextResponse } from "next/server";
import { MembershipStatus, Prisma, UserStatus } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { hashPassword, requirePermission, permittedBranchIds } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("access.user.view");
    const branches = permittedBranchIds(context, "access.user.view");
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId") || undefined;
    const search = params.get("search")?.trim().toLowerCase() || undefined;
    const status = params.get("status") as MembershipStatus | null;

    const memberships = await prisma.companyMembership.findMany({
      where: {
        companyId: context.company.id,
        ...(status ? { status } : {}),
        ...(branchId || branches
          ? {
              userRoles: {
                some: {
                  branchId: branchId ? branchId : branches ? { in: branches } : undefined,
                },
              },
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            salesInvoicesAsSalesperson: {
              where: { status: "POSTED" },
              select: {
                id: true,
                grandTotal: true,
                subtotal: true,
                discountTotal: true,
                costTotal: true,
              },
            },
            incentiveAwards: {
              select: {
                id: true,
                calculatedAmount: true,
                approvedAmount: true,
                status: true,
              },
            },
          },
        },
        userRoles: {
          include: {
            role: { select: { id: true, code: true, name: true } },
            branch: { select: { id: true, code: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const staffList = memberships
      .map((m) => {
        const primaryRole = m.userRoles[0]?.role;
        const primaryBranch = m.userRoles[0]?.branch;
        const isSalesperson = m.userRoles.some((r) => r.role.code === "SALESPERSON");

        const postedSales = m.user.salesInvoicesAsSalesperson || [];
        const totalSalesAmount = postedSales.reduce((acc: number, inv) => acc + Number(inv.grandTotal), 0);
        const totalSalesCost = postedSales.reduce((acc: number, inv) => acc + Number(inv.costTotal), 0);
        const totalGrossProfit = totalSalesAmount - totalSalesCost;

        const incentiveAwards = m.user.incentiveAwards || [];
        const totalEarnedIncentive = incentiveAwards.reduce(
          (acc: number, inc) => acc + Number(inc.approvedAmount || inc.calculatedAmount),
          0
        );

        return {
          id: m.id,
          employeeCode: m.employeeCode || `EMP-${m.user.id.slice(0, 5).toUpperCase()}`,
          fullName: m.user.fullName,
          email: m.user.email,
          phone: m.user.phone || "—",
          jobTitle: m.jobTitle || primaryRole?.name || "Staff Member",
          status: m.status,
          userStatus: m.user.status,
          joinedAt: m.joinedAt,
          userId: m.user.id,
          isOwner: m.isOwner,
          isSalesperson,
          role: primaryRole ? { id: primaryRole.id, code: primaryRole.code, name: primaryRole.name } : null,
          branch: primaryBranch ? { id: primaryBranch.id, code: primaryBranch.code, name: primaryBranch.name } : null,
          allRoles: m.userRoles.map((r) => ({
            roleCode: r.role.code,
            roleName: r.role.name,
            branchCode: r.branch?.code || "ALL",
          })),
          salesCount: postedSales.length,
          totalSalesAmount,
          totalGrossProfit,
          totalEarnedIncentive,
        };
      })
      .filter((s) => {
        if (!search) return true;
        return (
          s.fullName.toLowerCase().includes(search) ||
          s.employeeCode.toLowerCase().includes(search) ||
          s.email.toLowerCase().includes(search) ||
          s.jobTitle.toLowerCase().includes(search)
        );
      });

    return NextResponse.json({
      data: jsonSafe(staffList),
      total: staffList.length,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.user.create");
    const body = await request.json();

    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const employeeCode = body.employeeCode ? String(body.employeeCode).trim().toUpperCase() : null;
    const jobTitle = String(body.jobTitle || "Staff Member").trim();
    const branchId = body.branchId ? String(body.branchId) : null;
    const warehouseId = body.warehouseId ? String(body.warehouseId) : null;
    const roleCode = String(body.roleCode || "SALESPERSON").trim();
    const temporaryPassword = body.temporaryPassword ? String(body.temporaryPassword) : "AxonStaff@2026!";

    if (!fullName) throw new ApiError(422, "FULL_NAME_REQUIRED", "Employee full name is required.");
    if (!email || !email.includes("@")) throw new ApiError(422, "INVALID_EMAIL", "A valid email address is required.");

    const [role, branch] = await Promise.all([
      prisma.role.findFirst({ where: { code: roleCode, companyId: context.company.id, isActive: true } }),
      branchId ? prisma.branch.findFirst({ where: { id: branchId, companyId: context.company.id, isActive: true } }) : Promise.resolve(null),
    ]);

    if (!role) throw new ApiError(422, "INVALID_ROLE", `Role ${roleCode} was not found or is inactive.`);
    if (branchId && !branch) throw new ApiError(422, "INVALID_BRANCH", "Selected branch is invalid or inactive.");

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            fullName,
            email,
            phone,
            passwordHash: await hashPassword(temporaryPassword),
            status: UserStatus.ACTIVE,
            forcePasswordChange: true,
          },
        });
      } else {
        await tx.user.update({
          where: { id: user.id },
          data: {
            fullName,
            phone: phone || user.phone,
          },
        });
      }

      let membership = await tx.companyMembership.findUnique({
        where: {
          companyId_userId: {
            companyId: context.company.id,
            userId: user.id,
          },
        },
      });

      if (!membership) {
        membership = await tx.companyMembership.create({
          data: {
            companyId: context.company.id,
            userId: user.id,
            employeeCode: employeeCode || `EMP-${user.id.slice(0, 5).toUpperCase()}`,
            jobTitle,
            status: MembershipStatus.ACTIVE,
            isOwner: false,
            joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
          },
        });
      } else {
        membership = await tx.companyMembership.update({
          where: { id: membership.id },
          data: {
            employeeCode: employeeCode || membership.employeeCode,
            jobTitle: jobTitle || membership.jobTitle,
            status: MembershipStatus.ACTIVE,
          },
        });
      }

      const existingRole = await tx.userRole.findFirst({
        where: {
          membershipId: membership.id,
          roleId: role.id,
          branchId: branchId || null,
        },
      });

      if (!existingRole) {
        await tx.userRole.create({
          data: {
            membershipId: membership.id,
            roleId: role.id,
            branchId: branchId || null,
            warehouseId: warehouseId || null,
          },
        });
      }

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: branchId || context.activeBranchId,
          action: "STAFF_CREATED",
          module: "staff",
          entityType: "CompanyMembership",
          entityId: membership.id,
          entityReference: membership.employeeCode || user.email,
          newValues: {
            fullName: user.fullName,
            email: user.email,
            employeeCode: membership.employeeCode,
            jobTitle: membership.jobTitle,
            role: role.code,
            branchId,
          },
        },
        tx
      );

      return { user, membership, role };
    });

    return NextResponse.json({ data: jsonSafe(result) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_STAFF", "An employee code or user with these identifiers already exists."));
    }
    return apiError(error);
  }
}
