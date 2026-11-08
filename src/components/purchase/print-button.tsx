"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="no-print inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Printer className="h-4 w-4"/>{label}</button>;
}
