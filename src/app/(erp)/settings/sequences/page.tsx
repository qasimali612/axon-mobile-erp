import { SequenceWorkspace } from "@/components/settings/sequence-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Document Sequences & Numbering" };

export default async function SequencesPage() {
  const context = await requirePagePermission("policy.manage");

  return (
    <div className="mx-auto max-w-[1520px]">
      <SequenceWorkspace permissions={context.permissions} />
    </div>
  );
}

