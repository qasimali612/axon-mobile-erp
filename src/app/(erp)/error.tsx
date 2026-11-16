"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function ErpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ERP Page Error]:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 px-4 text-center">
      <div className="surface p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Unable to Load Workspace
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          An error occurred while loading this page. This may be due to a transient database connection or session timeout.
        </p>
        {error.message && !error.message.includes("Digest") && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-mono text-slate-700 break-words text-left">
            {error.message}
          </div>
        )}
        {error.digest && (
          <p className="mt-2 text-[11px] text-slate-400">
            Error Reference ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Return to Dashboard
          </Link>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </p>
    </div>
  );
}

