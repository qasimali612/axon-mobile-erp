"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { DocumentReversalDialog } from "@/components/operations/document-reversal-dialog";

type Props = {
  documentId: string;
  documentNumber: string;
  documentLabel: string;
  endpoint: string;
  consequence: string;
  disabledReason?: string | null;
};

export function DocumentReversalAction(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return <>
    <button disabled={Boolean(props.disabledReason)} title={props.disabledReason || "Post an authorized linked reversal"} onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="h-4 w-4"/>Reverse posted document</button>
    <DocumentReversalDialog key={`${props.documentId}:${open}`} open={open} documentNumber={props.documentNumber} documentLabel={props.documentLabel} endpoint={props.endpoint} consequence={props.consequence} onClose={() => setOpen(false)} onComplete={() => { setOpen(false); router.refresh(); }}/>
  </>;
}
