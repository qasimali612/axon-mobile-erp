"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, titleCase } from "@/lib/utils";

type Tab = "customers" | "suppliers";

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

    const [response, lookup] = await Promise.all([
      fetch(`/api/${tab}?${query}`),
      branches.length ? Promise.resolve(null) : fetch("/api/operations/lookups"),
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
    setLoading(false);
  }, [tab, page, pageSize, debouncedSearch, branches.length]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingRow(null);
    setBranchId("");
    setCode("");
    setName("");
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
            code,
            name,
            customerType: editingRow?.customerType || "RETAIL",
            phone: phone || null,
            email: email || null,
            address: address || null,
            taxNumber: taxNumber || null,
            creditLimit,
            paymentTermsDays: Number(terms),
          }
        : {
            branchId: branchId || null,
            code,
            name,
            contactPerson: contact || null,
            phone: phone || null,
            email: email || null,
            address: address || null,
            taxNumber: taxNumber || null,
            creditLimit,
            paymentTermsDays: Number(terms),
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

    toast.success(`${body.data.code} ${isEdit ? "updated" : "created"}`);
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
            Party records flow into sales, procurement, settlement, aging, and general-ledger dimensions.
          </p>
        </div>
        {can(tab) ? (
          <Button onClick={openCreate}>
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
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${
                tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-900"
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
              placeholder={`Search ${tab} by code, name, phone…`}
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
                <th className="px-5 py-3">Code / name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Credit limit</th>
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
                      <b>{row.name}</b>
                      <span className="block text-[10px] text-slate-400">
                        {row.code}
                        {row.customerType ? ` · ${row.customerType}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {row.contactPerson || row.phone || row.email || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {row.branch ? `${row.branch.code} · ${row.branch.name}` : "Company-wide"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                      {formatMoney(row.creditLimit, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{row.paymentTermsDays} days</td>
                    <td className="px-4 py-3.5">
                      <Badge tone={row.status === "ACTIVE" ? "green" : "slate"}>{titleCase(row.status)}</Badge>
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

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={saveParty} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex justify-between border-b px-6 py-4">
              <h2 className="font-bold text-slate-900">
                {editingRow ? "Edit" : "New"} {tab === "customers" ? "customer" : "supplier"}
              </h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-2">
              <label className="field-label">
                Code
                <input
                  required
                  className="field-input uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <label className="field-label">
                Name
                <input required className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {tab === "suppliers" ? (
                <label className="field-label">
                  Contact person
                  <input
                    className="field-input"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="field-label">
                Phone
                <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="field-label">
                Email
                <input
                  type="email"
                  className="field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field-label">
                Tax registration / NTN
                <input
                  className="field-input"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                />
              </label>
              <label className="field-label">
                Branch
                <select
                  className="field-input"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">Company-wide</option>
                  {branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Credit limit
                <input
                  required
                  inputMode="decimal"
                  className="field-input"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </label>
              <label className="field-label">
                Payment terms (days)
                <input
                  required
                  type="number"
                  min="0"
                  className="field-input"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <label className="field-label md:col-span-2">
                Postal address
                <input
                  className="field-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingRow ? "Save changes" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
