import { OperationsReportWorkspace } from "@/components/reports/operations-report-workspace";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<{
    report?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function OperationsReportsPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("dashboard.view");
  const params = await searchParams;
  const company = await prisma.company.findUnique({
    where: { id: context.company.id },
  });

  return (
    <OperationsReportWorkspace
      company={company || context.company}
      currency={context.company.currencyCode}
      permissions={context.permissions}
      initialReport={params.report}
      initialFrom={params.from}
      initialTo={params.to}
    />
  );
}
