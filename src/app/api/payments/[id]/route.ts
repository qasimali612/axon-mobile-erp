import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const context = await requirePermission("PAYMENT_VIEW");

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        companyId: context.company.id,
      },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            currencyCode: true,
            taxRegistrationNumber: true,
            phone: true,
            email: true,
            addressLine1: true,
            city: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            addressLine1: true,
            city: true,
            phone: true,
          },
        },
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            taxNumber: true,
            creditLimit: true,
            paymentTermsDays: true,
          },
        },
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            taxNumber: true,
            paymentTermsDays: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            code: true,
            bankName: true,
            accountTitle: true,
            iban: true,
            accountNumberLast4: true,
            bankBranchName: true,
            currencyCode: true,
          },
        },
        cashAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            currencyCode: true,
          },
        },
        paymentMethod: {
          select: {
            id: true,
            code: true,
            name: true,
            methodType: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        postedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        reversedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        journalEntry: {
          select: {
            id: true,
            voucherNumber: true,
            postingDate: true,
            lines: {
              select: {
                id: true,
                account: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
                debit: true,
                credit: true,
                description: true,
              },
            },
          },
        },
        allocations: {
          include: {
            salesInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                grandTotal: true,
                status: true,
              },
            },
            purchaseReceipt: {
              select: {
                id: true,
                receiptNumber: true,
                receiptDate: true,
                grandTotal: true,
                status: true,
              },
            },
          },
        },
        reversalOf: {
          select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Payment voucher not found." } },
        { status: 404 }
      );
    }

    return NextResponse.json(jsonSafe({ data: payment }));
  } catch (error) {
    return apiError(error);
  }
}
