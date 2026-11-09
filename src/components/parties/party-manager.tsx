"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney, titleCase } from "@/lib/utils";

type Tab = "customers" | "suppliers";

const CUSTOMER_TYPES = [
  { value: "RETAIL", label: "Retail / Walk-In", desc: "Counter customers & immediate buyers" },
  { value: "WHOLESALE", label: "Wholesale", desc: "Bulk device & accessory buyers" },
  { value: "DEALER", label: "Dealer / Franchise", desc: "Authorized retail partners" },
  { value: "DISTRIBUTOR", label: "Distributor", desc: "Regional tier-1 stockists" },
  { value: "CORPORATE", label: "Corporate", desc: "Enterprise & institutional accounts" },
];

export function PartyManager({
  currency,
  permissions,
  initialTab,
}: {
  currency: string;
  permissions: string[];
  initialTab?: Tab;
}) {
  const preferred =
    initialTab && permissions.includes(initialTab === "customers" ? "customer.manage" : "supplier.manage")
      ? initialTab
      : permissions.includes("customer.manage")
      ? "customers"
      : "suppliers";

  const [tab, setTab] = useState<Tab>(preferred);
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Create / Edit modal state
  const [open, setOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [customerType, setCustomerType] = useState("RETAIL");
  const [priceListId, setPriceListId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [terms, setTerms] = useState("0");

  const can = (item: Tab) => permissions.includes(item === "customers" ? "customer.manage" : "supplier.manage");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const load = useCallback(async () => {
    if (!can(tab)) return;
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());

    const [response, lookup, priceListRes] = await Promise.all([
      fetch(`/api/${tab}?${query}`),
      branches.length ? Promise.resolve(null) : fetch("/api/operations/lookups"),
      priceLists.length ? Promise.resolve(null) : fetch("/api/catalog/price-lists"),
    ]);

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setLoading(false);
      return toast.error(body?.error?.message || "Party records could not be loaded.");
    }

    setRows(body.data || []);
    setTotal(body.pagination?.total || 0);

    if (lookup) {
      const lookBody = await lookup.json().catch(() => null);
      if (lookup.ok) setBranches(lookBody.data.branches || []);
    }

    if (priceListRes) {
      const plBody = await priceListRes.json().catch(() => null);
      if (priceListRes.ok) setPriceLists((plBody.data || []).filter((p: any) => p.isActive));
    }

    setLoading(false);
  }, [tab, page, pageSize, debouncedSearch, branches.length, priceLists.length]);

  useEffect(() => {
    void load();
  }, [load]);

  function autoGenCode() {
    const prefix = tab === "customers"
      ? customerType === "WHOLESALE"
        ? "WHS"
        : customerType === "DEALER"
        ? "DLR"
        : customerType === "CORPORATE"
        ? "CORP"
        : "CUST"
      : "SUP";
    const rand = Math.floor(1000 + Math.random() * 9000);
    const generated = `${prefix}-${rand}`;
    setCode(generated);
    toast.success(`Generated code: ${generated}`);
  }

  function openCreate() {
    setEditingRow(null);
    setBranchId("");
    const prefix = tab === "customers" ? "CUST" : "SUP";
    const rand = Math.floor(1000 + Math.random() * 9000);
    setCode(`${prefix}-${rand}`);
    setName("");
    setCustomerType("RETAIL");
    setPriceListId("");
    setStatus("ACTIVE");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
    setTaxNumber("");
    setCreditLimit("0");
    setTerms("0");
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditingRow(row);
    setBranchId(row.branchId || "");
    setCode(row.code);
    setName(row.name);
    setCustomerType(row.customerType || "RETAIL");
    setPriceListId(row.priceListId || "");
    setStatus(row.status || "ACTIVE");
    setContact(row.contactPerson || "");
    setPhone(row.phone || "");
    setEmail(row.email || "");
    setAddress(row.address || "");
    setTaxNumber(row.taxNumber || "");
    setCreditLimit(row.creditLimit ? String(row.creditLimit) : "0");
    setTerms(String(row.paymentTermsDays || 0));
    setOpen(true);
  }

  async function saveParty(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const isEdit = Boolean(editingRow);
    const url = isEdit ? `/api/${tab}/${editingRow.id}` : `/api/${tab}`;
    const method = isEdit ? "PUT" : "POST";

    const payload =
      tab === "customers"
        ? {
            branchId: branchId || null,
            code: code.trim().toUpperCase(),
            name: name.trim(),
            customerType,
            priceListId: priceListId || null,
            status,
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            taxNumber: taxNumber.trim() || null,
            creditLimit: creditLimit.trim() || "0",
            paymentTermsDays: Number(terms) || 0,
          }
        : {
            branchId: branchId || null,
            code: code.trim().toUpperCase(),
            name: name.trim(),
            contactPerson: contact.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            taxNumber: taxNumber.trim() || null,
            creditLimit: creditLimit.trim() || "0",
            paymentTermsDays: Number(terms) || 0,
          };

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      return toast.error(body?.error?.message || `Party could not be ${isEdit ? "updated" : "created"}.`);
    }

    toast.success(`${body.data.code} ${isEdit ? "updated successfully" : "created successfully"}`);
    setOpen(false);
    void load();
  }

  async function deactivateParty(row: any) {
    if (!window.confirm(`Deactivate or delete party ${row.code} (${row.name})?`)) return;
    const response = await fetch(`/api/${tab}/${row.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return toast.error(body?.error?.message || "Failed to remove party.");
    }
    toast.success(body?.message || `${row.code} removed.`);
    void load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="kicker">Subledger masters</span>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Customers & suppliers</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Enterprise party profiles with customer segmentation, custom price lists, credit limits, and subledger aging.
          </p>
        </div>
        {can(tab) ? (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New {tab === "customers" ? "customer" : "supplier"}
          </Button>
        ) : null}
      </div>

      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex gap-1">
          {(["customers", "suppliers"] as Tab[]).filter(can).map((item) => (
            <button
              key={item}
              onClick={() => {
                setTab(item);
                setSearch("");
              }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                tab === item ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {item === "customers" ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
              {titleCase(item)}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab} by code, name, phone, NTN…`}
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Code / Name / Type</th>
                <th className="px-4 py-3">Contact Details</th>
                <th className="px-4 py-3">Branch & Pricing</th>
                <th className="px-4 py-3 text-right">Credit Limit</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    Loading parties…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    No {tab} found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="text-xs hover:bg-slate-50/50">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900">{row.name}</span>
                        {row.customerType ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              row.customerType === "WHOLESALE"
                                ? "bg-blue-100 text-blue-800"
                                : row.customerType === "DEALER"
                                ? "bg-emerald-100 text-emerald-800"
                                : row.customerType === "CORPORATE"
                                ? "bg-purple-100 text-purple-800"
                                : row.customerType === "DISTRIBUTOR"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.customerType}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-400">
                        <span>{row.code}</span>
                        {row.taxNumber ? <span>· NTN/CNIC: {row.taxNumber}</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <p className="font-medium text-slate-800">
                        {row.contactPerson || row.phone || row.email || "—"}
                      </p>
                      {row.phone && row.contactPerson ? (
                        <p className="font-mono text-[10px] text-slate-400">{row.phone}</p>
                      ) : null}
                      {row.email ? (
                        <p className="max-w-[150px] truncate text-[10px] text-slate-400">{row.email}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      <p>{row.branch ? `${row.branch.code} · ${row.branch.name}` : "Company-wide"}</p>
                      {row.priceList ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-600">
                          <Tag className="h-3 w-3" />
                          {row.priceList.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Default pricing</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                      {formatMoney(row.creditLimit, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {Number(row.paymentTermsDays) === 0 ? "Immediate Cash" : `Net ${row.paymentTermsDays}d`}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        tone={
                          row.status === "ACTIVE"
                            ? "green"
                            : row.status === "ON_HOLD"
                            ? "amber"
                            : "slate"
                        }
                      >
                        {titleCase(row.status || "ACTIVE")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/finance/subledgers?party=${tab === "customers" ? "customer" : "supplier"}:${row.id}`}
                          className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                          title="View Ledger Statement"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Statement
                        </Link>
                        <Link
                          href={`/finance/subledgers/${tab === "customers" ? "customer" : "supplier"}/${row.id}/print`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                          title="Print Official Ledger Statement"
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </Link>
                        {can(tab) ? (
                          <>
                            <button
                              onClick={() => openEdit(row)}
                              className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                              title="Edit party"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void deactivateParty(row)}
                              className="rounded border border-slate-200 p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Deactivate / Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} records
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 font-medium">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Enterprise Customer / Supplier Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingRow ? `Edit ${tab === "customers" ? "Customer" : "Supplier"} · ${editingRow.code}` : `Create New ${tab === "customers" ? "Customer" : "Supplier"}`}
        description="Comprehensive subledger account profile with segmentation, assigned commercial pricing, credit policy, and legal identifiers."
        size="lg"
      >
        <form onSubmit={saveParty} className="space-y-5 p-5 sm:p-6">
          {/* Section 1: Customer Type / Classification (Customers only) */}
          {tab === "customers" && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-800">
                Customer Classification & Segment <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CUSTOMER_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCustomerType(t.value)}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      customerType === t.value
                        ? "border-blue-600 bg-blue-50/80 text-blue-900 shadow-sm ring-1 ring-blue-600"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="text-xs font-bold">{t.label}</span>
                    <span className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Core Identity Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">
                Party Code <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  required
                  className="input font-mono uppercase flex-1"
                  placeholder="e.g. CUST-1042"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  onClick={autoGenCode}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  title="Auto-generate standard sequential code"
                >
                  <Zap className="h-3.5 w-3.5" /> Auto-Gen
                </button>
              </div>
            </div>

            <div>
              <label className="label">
                Full Name / Legal Entity <span className="text-red-500">*</span>
              </label>
              <input
                required
                className="input"
                placeholder="e.g. Al-Madina Cellular / Imran Khan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {tab === "suppliers" && (
              <div>
                <label className="label">Contact Person</label>
                <input
                  className="input"
                  placeholder="Key account manager / representative"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="label">Status</label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">Active (Can transacting freely)</option>
                <option value="ON_HOLD">On Hold (Temporarily paused)</option>
                <option value="INACTIVE">Inactive (Disabled for new transactions)</option>
              </select>
            </div>

            <div>
              <label className="label">Branch Authorization</label>
              <select
                className="select"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Company-wide (All Branches & Outlets)</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 3: Commercial Policy & Credit Terms */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-blue-600" /> Commercial Terms & Pricing Policy
            </h3>

            <div className="grid gap-4 sm:grid-cols-3">
              {tab === "customers" && (
                <div>
                  <label className="label">Assigned Price List</label>
                  <select
                    className="select"
                    value={priceListId}
                    onChange={(e) => setPriceListId(e.target.value)}
                  >
                    <option value="">Automatic / Default Rate</option>
                    {priceLists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name} ({p.priceLevel})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Applies custom wholesale or retail rate rules in POS & Sales.
                  </span>
                </div>
              )}

              <div>
                <label className="label">Credit Limit (Rs.)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rs</span>
                  <input
                    required
                    inputMode="decimal"
                    className="input pl-9 font-mono"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {["0", "50000", "100000", "500000", "1000000"].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCreditLimit(amt)}
                      className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-300"
                    >
                      {amt === "0" ? "0 (Cash)" : amt === "1000000" ? "1M" : `${Number(amt) / 1000}k`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Payment Terms (Days)</label>
                <input
                  required
                  type="number"
                  min="0"
                  max="365"
                  className="input font-mono"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[
                    { days: "0", label: "Cash (0d)" },
                    { days: "7", label: "7d" },
                    { days: "15", label: "15d" },
                    { days: "30", label: "30d" },
                    { days: "60", label: "60d" },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setTerms(preset.days)}
                      className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-300"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Contact & Identification */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label flex items-center gap-1">
                <Phone className="h-3 w-3 text-slate-400" /> Phone / WhatsApp
              </label>
              <input
                className="input font-mono"
                placeholder="0300-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="customer@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label">NTN / CNIC / STRN</label>
              <input
                className="input font-mono uppercase"
                placeholder="e.g. 35202-xxxxxxx-x"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value.toUpperCase())}
              />
            </div>

            <div className="sm:col-span-3">
              <label className="label flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400" /> Shop / Postal Address
              </label>
              <textarea
                className="input min-h-[60px] py-2"
                placeholder="Shop number, plaza, commercial market, city…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingRow ? "Save changes" : `Create ${tab === "customers" ? "customer" : "supplier"}`}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
