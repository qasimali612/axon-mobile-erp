"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LogIn } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Application Error]:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full surface p-8 text-center shadow-lg rounded-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Application Error</h1>
        <p className="mt-2 text-sm text-slate-500">
          The system encountered an unexpected error while loading this view.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs font-mono text-slate-400">
            System Incident ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <LogIn className="h-4 w-4" />
            Go to Login
          </Link>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-slate-400">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </p>
    </div>
  );
}

