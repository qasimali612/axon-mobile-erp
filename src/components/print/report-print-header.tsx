import React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { PrintButton } from "@/components/purchase/print-button";

type CompanyInfo = {
  name: string;
  legalName?: string | null;
  code: string;
  registrationNumber?: string | null;
  taxRegistrationNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  currencyCode?: string;
  timeZone?: string;
};

type MetaItem = {
  label: string;
  value: string;
};

type Props = {
  company: CompanyInfo;
  title: string;
  subtitle?: string;
  documentNumber?: string;
  status?: string;
  periodLabel?: string;
  branchName?: string;
  backHref?: string;
  metaItems?: MetaItem[];
};

export function ReportPrintHeader({
  company,
  title,
  subtitle,
  documentNumber,
  status,
  periodLabel,
  branchName,
  backHref,
  metaItems,
}: Props) {
  const addressParts = [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.province,
    company.postalCode,
    company.countryCode,
  ].filter(Boolean);

  const contactParts = [
    company.phone ? `Tel: ${company.phone}` : null,
    company.email ? `Email: ${company.email}` : null,
    company.taxRegistrationNumber ? `Tax Reg / NTN: ${company.taxRegistrationNumber}` : null,
    company.registrationNumber ? `Reg No: ${company.registrationNumber}` : null,
  ].filter(Boolean);

  return (
    <div className="w-full">
      {/* Screen-only top action bar */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          ) : null}
          <div>
            <p className="text-xs font-bold text-slate-900">Print Preview</p>
            <p className="text-[11px] text-slate-500">{title} · Official Report Document</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PrintButton label="Print Document / Save as PDF" />
        </div>
      </div>

      {/* Official Printed Header */}
      <header className="border-b-2 border-slate-900 pb-5 mb-6">
        <div className="flex items-start justify-between gap-6">
          {/* Company Branding & Address */}
          <div className="flex gap-4 min-w-0 flex-1">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-950 text-xl font-black text-white shadow-sm print:bg-black print:text-white">
              {company.code ? company.code.slice(0, 2).toUpperCase() : "AX"}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold uppercase tracking-tight text-slate-950 sm:text-2xl">
                {company.legalName || company.name}
              </h1>
              {addressParts.length ? (
                <p className="mt-1 text-xs text-slate-600">
                  {addressParts.join(", ")}
                </p>
              ) : null}
              {contactParts.length ? (
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  {contactParts.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>

          {/* Document / Report Title & Details */}
          <div className="text-right shrink-0">
            <span className="inline-block text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-700">
              {title}
            </span>
            {documentNumber ? (
              <div className="mt-1 text-xl font-extrabold font-mono text-slate-950 sm:text-2xl">
                {documentNumber}
              </div>
            ) : null}
            {status ? (
              <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-800 uppercase tracking-wider print:border print:border-slate-300">
                {status}
              </span>
            ) : null}
            {periodLabel ? (
              <p className="mt-1.5 text-xs font-bold text-slate-800">
                Period: {periodLabel}
              </p>
            ) : null}
            {branchName ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Branch: {branchName}
              </p>
            ) : null}
          </div>
        </div>

        {/* Dynamic Meta Grid (e.g. Date, Currency, Prepared by, etc.) */}
        {metaItems && metaItems.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs sm:grid-cols-4">
            {metaItems.map((item, idx) => (
              <div key={idx}>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  {item.label}
                </span>
                <span className="font-semibold text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </header>
    </div>
  );
}

