import React from "react";

type Signer = {
  name: string;
  role: string;
  date?: string;
};

type Props = {
  signers?: Signer[];
  notes?: string | null;
  generatedAt?: string;
  documentId?: string;
};

export function ReportPrintSignatures({
  signers = [
    { name: "Accountant", role: "Prepared by" },
    { name: "Senior Auditor", role: "Verified by" },
    { name: "Finance Controller", role: "Approved by" },
  ],
  notes,
  generatedAt,
  documentId,
}: Props) {
  return (
    <div className="print-break-avoid mt-12 pt-4">
      {notes ? (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Terms & Notes
          </span>
          <p className="mt-1 text-slate-700 whitespace-pre-wrap">{notes}</p>
        </div>
      ) : null}

      <div className={`grid gap-8 text-center text-xs`} style={{ gridTemplateColumns: `repeat(${signers.length}, minmax(0, 1fr))` }}>
        {signers.map((s, idx) => (
          <div key={idx} className="flex flex-col justify-end">
            <div className="border-b border-slate-400 h-12 mb-2" />
            <b className="text-slate-900 block truncate">{s.name}</b>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{s.role}</span>
            {s.date ? <span className="text-[9px] text-slate-400">{s.date}</span> : null}
          </div>
        ))}
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[9px] text-slate-400">
        <div>
          {generatedAt ? `Generated: ${generatedAt}` : `Printed: ${new Date().toLocaleString()}`}
          {documentId ? ` · ID: ${documentId}` : ""}
        </div>
        <div>
          AXON MOBILE ERP · Authoritative Posted Ledger System
        </div>
      </footer>
    </div>
  );
}

