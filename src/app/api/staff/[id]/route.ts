import { NextResponse } from "next/server";
import { MembershipStatus, Prisma } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requirePermission("access.user.view");
    const { id } = await params;

    const membership = await prisma.companyMembership.findFirst({
      where: {
        id,
        companyId: context.company.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            status: true,
            createdAt: true,
            salesInvoicesAsSalesperson: {
              where: { status: "POSTED" },
              select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                grandTotal: true,
                subtotal: true,
                discountTotal: true,
                costTotal: true,
                customer: { select: { id: true, name: true, phone: true } },
                branch: { select: { id: true, code: true, name: true } },
              },
              orderBy: { invoiceDate: "desc" },
              take: 50,
            },
            incentiveAwards: {
              select: {
                id: true,
                periodStart: true,
                periodEnd: true,
                eligibleQuantity: true,
                eligibleNetSales: true,
                calculatedAmount: true,
                approvedAmount: true,
                status: true,
                plan: { select: { id: true, code: true, name: true, incentiveType: true } },
                payable: {
                  select: {
                    id: true,
                    voucherNumber: true,
                    accruedAmount: true,
                    paidAmount: true,
                    outstandingAmount: true,
                    status: true,
                    payments: {
                      select: {
                        id: true,
                        amount: true,
                        paymentDate: true,
                        paymentMethod: true,
                        reference: true,
                      },
                    },
                  },
                },
              },
              orderBy: { periodEnd: "desc" },
            },
          },
        },
        userRoles: {
          include: {
            role: true,
            branch: true,
            warehouse: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member was not found.");
    }

    const postedInvoices = membership.user.salesInvoicesAsSalesperson || [];
    const totalSalesAmount = postedInvoices.reduce((acc, inv) => acc + Number(inv.grandTotal), 0);
    const totalCostAmount = postedInvoices.reduce((acc, inv) => acc + Number(inv.costTotal), 0);
    const totalGrossProfit = totalSalesAmount - totalCostAmount;

    const incentiveAwards = membership.user.incentiveAwards || [];
    const totalEarnedIncentive = incentiveAwards.reduce(
      (acc, inc) => acc + Number(inc.approvedAmount || inc.calculatedAmount),
      0
    );
    const totalPaidIncentive = incentiveAwards.reduce(
      (acc, inc) => acc + Number(inc.payable?.paidAmount || 0),
      0
    );
    const totalOutstandingIncentive = incentiveAwards.reduce(
      (acc, inc) => acc + Number(inc.payable?.outstandingAmount || 0),
      0
    );

    return NextResponse.json({
      data: jsonSafe({
        membership: {
          id: membership.id,
          employeeCode: membership.employeeCode || `EMP-${membership.user.id.slice(0, 5).toUpperCase()}`,
          jobTitle: membership.jobTitle,
          status: membership.status,
          joinedAt: membership.joinedAt,
          endedAt: membership.endedAt,
          isOwner: membership.isOwner,
        },
        user: {
          id: membership.user.id,
          fullName: membership.user.fullName,
          email: membership.user.email,
          phone: membership.user.phone,
          status: membership.user.status,
          createdAt: membership.user.createdAt,
        },
        roles: membership.userRoles.map((r) => ({
          id: r.id,
          roleId: r.roleId,
          roleCode: r.role.code,
          roleName: r.role.name,
          branchId: r.branchId,
          branchCode: r.branch?.code || "ALL",
          branchName: r.branch?.name || "All Branches",
        })),
        kpis: {
          salesCount: postedInvoices.length,
          totalSalesAmount,
          totalCostAmount,
          totalGrossProfit,
          grossProfitMargin: totalSalesAmount > 0 ? (totalGrossProfit / totalSalesAmount) * 100 : 0,
          totalEarnedIncentive,
          totalPaidIncentive,
          totalOutstandingIncentive,
        },
        recentSales: postedInvoices,
        incentiveHistory: incentiveAwards,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.user.edit");
    const { id } = await params;
    const body = await request.json();

    const membership = await prisma.companyMembership.findFirst({
      where: { id, companyId: context.company.id },
      include: { user: true },
    });

    if (!membership) {
      throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member was not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      if (body.fullName !== undefined || body.phone !== undefined) {
        await tx.user.update({
          where: { id: membership.userId },
          data: {
            fullName: body.fullName !== undefined ? String(body.fullName).trim() : undefined,
            phone: body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined,
          },
        });
      }

      const updatedMembership = await tx.companyMembership.update({
        where: { id },
        data: {
          employeeCode: body.employeeCode !== undefined ? (body.employeeCode ? String(body.employeeCode).trim().toUpperCase() : null) : undefined,
          jobTitle: body.jobTitle !== undefined ? String(body.jobTitle).trim() : undefined,
          status: body.status !== undefined ? (body.status as MembershipStatus) : undefined,
        },
      });

      if (body.roleId || body.branchId) {
        const primaryRole = await tx.userRole.findFirst({
          where: { membershipId: membership.id },
          orderBy: { createdAt: "asc" },
        });

        if (primaryRole) {
          await tx.userRole.update({
            where: { id: primaryRole.id },
            data: {
              roleId: body.roleId || primaryRole.roleId,
              branchId: body.branchId !== undefined ? body.branchId : primaryRole.branchId,
            },
          });
        }
      }

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "STAFF_UPDATED",
          module: "staff",
          entityType: "CompanyMembership",
          entityId: membership.id,
          entityReference: membership.employeeCode || membership.user.email,
          newValues: {
            employeeCode: body.employeeCode,
            jobTitle: body.jobTitle,
            status: body.status,
            fullName: body.fullName,
            phone: body.phone,
          },
        },
        tx
      );

      return updatedMembership;
    });

    return NextResponse.json({ data: jsonSafe(result) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_STAFF_CODE", "This employee code is already assigned to another staff member."));
    }
    return apiError(error);
  }
}

