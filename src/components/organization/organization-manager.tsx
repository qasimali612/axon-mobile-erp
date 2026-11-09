"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Building2,
  CheckCircle2,
  CircleOff,
  FolderTree,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Store,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { titleCase } from "@/lib/utils";

type Company = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  countryCode: string;
  province: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  currencyCode: string;
  timeZone: string;
  fiscalYearStartMonth: number;
  decimalPrecision: number;
  inventoryCostingMethod: string;
  allowNegativeStock: boolean;
};

type Branch = {
  id: string;
  code: string;
  name: string;
  type: string;
  documentPrefix: string;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  _count?: { warehouses: number };
};

type Warehouse = {
  id: string;
  branchId: string;
  code: string;
  name: string;
  type: string;
  city: string | null;
  phone: string | null;
  allowReceiving: boolean;
  allowDispatch: boolean;
  isDefault: boolean;
  isActive: boolean;
  branch: { id: string; code: string; name: string };
  _count?: { locations: number };
};

type Department = {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
  isActive: boolean;
  branch?: { id: string; code: string; name: string } | null;
  _count?: { journalLines: number; assets: number; budgets: number };
};

const branchDefault = {
  code: "",
  name: "",
  type: "RETAIL_STORE",
  documentPrefix: "",
  city: "",
  province: "Punjab",
  phone: "",
  email: "",
  isActive: true,
};

const warehouseDefault = (branchId = "") => ({
  branchId,
  code: "",
  name: "",
  type: "MAIN",
  city: "",
  phone: "",
  allowReceiving: true,
  allowDispatch: true,
  isDefault: false,
  isActive: true,
});

const departmentDefault = (branchId = "") => ({
  branchId,
  code: "",
  name: "",
  isActive: true,
});

export function OrganizationManager({
  initialCompany,
  initialBranches,
  initialWarehouses,
  initialDepartments = [],
  permissions,
}: {
  initialCompany: Company;
  initialBranches: Branch[];
  initialWarehouses: Warehouse[];
  initialDepartments?: Department[];
  permissions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "branches";
  const [tab, setTab] = useState(
    ["branches", "warehouses", "departments"].includes(initialTab) ? initialTab : "branches"
  );
  const [company, setCompany] = useState(initialCompany);
  const [branches, setBranches] = useState(initialBranches);
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);

  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(() => companyToForm(initialCompany));

  const [branchOpen, setBranchOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState(branchDefault);

  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [warehouseForm, setWarehouseForm] = useState(() => warehouseDefault(initialBranches[0]?.id));

  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentForm, setDepartmentForm] = useState(() => departmentDefault());

  const [saving, setSaving] = useState(false);

  const canEditCompany = permissions.includes("organization.company.edit");
  const canCreateBranch = permissions.includes("organization.branch.create");
  const canEditBranch = permissions.includes("organization.branch.edit");
  const canArchiveBranch = permissions.includes("organization.branch.archive");
  const canCreateWarehouse = permissions.includes("organization.warehouse.create");
  const canEditWarehouse = permissions.includes("organization.warehouse.edit");
  const canArchiveWarehouse = permissions.includes("organization.warehouse.archive");

  useEffect(() => {
    const intent = searchParams.get("new");
    if ((intent === "branch" || (intent === "1" && tab === "branches")) && canCreateBranch) openNewBranch();
    if ((intent === "warehouse" || (intent === "1" && tab === "warehouses")) && canCreateWarehouse) openNewWarehouse();
    if ((intent === "department" || (intent === "1" && tab === "departments")) && canCreateBranch) openNewDepartment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNewBranch() {
    setEditingBranch(null);
    setBranchForm(branchDefault);
    setBranchOpen(true);
  }
  function openEditBranch(branch: Branch) {
    setEditingBranch(branch);
    setBranchForm({
      code: branch.code,
      name: branch.name,
      type: branch.type,
      documentPrefix: branch.documentPrefix,
      city: branch.city || "",
      province: branch.province || "",
      phone: branch.phone || "",
      email: branch.email || "",
      isActive: branch.isActive,
    });
    setBranchOpen(true);
  }

  function openNewWarehouse() {
    setEditingWarehouse(null);
    setWarehouseForm(warehouseDefault(branches[0]?.id));
    setWarehouseOpen(true);
  }
  function openEditWarehouse(warehouse: Warehouse) {
    setEditingWarehouse(warehouse);
    setWarehouseForm({
      branchId: warehouse.branchId,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      city: warehouse.city || "",
      phone: warehouse.phone || "",
      allowReceiving: warehouse.allowReceiving,
      allowDispatch: warehouse.allowDispatch,
      isDefault: warehouse.isDefault,
      isActive: warehouse.isActive,
    });
    setWarehouseOpen(true);
  }

  function openNewDepartment() {
    setEditingDepartment(null);
    setDepartmentForm(departmentDefault());
    setDepartmentOpen(true);
  }
  function openEditDepartment(dept: Department) {
    setEditingDepartment(dept);
    setDepartmentForm({
      branchId: dept.branchId || "",
      code: dept.code,
      name: dept.name,
      isActive: dept.isActive,
    });
    setDepartmentOpen(true);
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(companyForm),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    setCompany(body.data);
    setCompanyOpen(false);
    toast.success("Company settings updated");
    router.refresh();
  }

  async function saveBranch(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(editingBranch ? `/api/branches/${editingBranch.id}` : "/api/branches", {
      method: editingBranch ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branchForm),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    setBranches((items) =>
      editingBranch
        ? items.map((item) => (item.id === editingBranch.id ? { ...item, ...body.data } : item))
        : [...items, { ...body.data, _count: { warehouses: 0 } }]
    );
    setBranchOpen(false);
    toast.success(editingBranch ? "Branch updated" : "Branch created");
    router.refresh();
  }

  async function saveWarehouse(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(
      editingWarehouse ? `/api/warehouses/${editingWarehouse.id}` : "/api/warehouses",
      {
        method: editingWarehouse ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseForm),
      }
    );
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    if (body.data.isDefault)
      setWarehouses((items) => items.map((item) => ({ ...item, isDefault: item.id === body.data.id })));
    setWarehouses((items) =>
      editingWarehouse
        ? items.map((item) => (item.id === editingWarehouse.id ? { ...item, ...body.data } : item))
        : [...items, { ...body.data, _count: { locations: 0 } }]
    );
    setWarehouseOpen(false);
    toast.success(editingWarehouse ? "Warehouse updated" : "Warehouse created");
    router.refresh();
  }

  async function saveDepartment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const url = editingDepartment
      ? `/api/organization/departments/${editingDepartment.id}`
      : "/api/organization/departments";
    const method = editingDepartment ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(departmentForm),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();

    const branch = branches.find((b) => b.id === body.data.branchId);
    const enriched = { ...body.data, branch };

    setDepartments((items) =>
      editingDepartment
        ? items.map((item) => (item.id === editingDepartment.id ? { ...item, ...enriched } : item))
        : [...items, enriched]
    );
    setDepartmentOpen(false);
    toast.success(editingDepartment ? "Department updated" : "Department created");
    router.refresh();
  }

  async function archiveBranch(branch: Branch) {
    const reason = window.prompt(`Reason for archiving ${branch.name}:`);
    if (!reason) return;
    const response = await fetch(`/api/branches/${branch.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) return toast.error(await responseError(response));
    setBranches((items) => items.filter((item) => item.id !== branch.id));
    toast.success("Branch archived");
    router.refresh();
  }

  async function archiveWarehouse(warehouse: Warehouse) {
    const reason = window.prompt(`Reason for archiving ${warehouse.name}:`);
    if (!reason) return;
    const response = await fetch(`/api/warehouses/${warehouse.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) return toast.error(await responseError(response));
    setWarehouses((items) => items.filter((item) => item.id !== warehouse.id));
    toast.success("Warehouse archived");
    router.refresh();
  }

  async function archiveDepartment(dept: Department) {
    if (!window.confirm(`Deactivate or remove department ${dept.name} (${dept.code})?`)) return;
    const response = await fetch(`/api/organization/departments/${dept.id}`, {
      method: "DELETE",
    });
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    if (body.message) {
      toast.info(body.message);
      setDepartments((items) =>
        items.map((item) => (item.id === dept.id ? { ...item, isActive: false } : item))
      );
    } else {
      setDepartments((items) => items.filter((item) => item.id !== dept.id));
      toast.success("Department removed");
    }
    router.refresh();
  }

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="relative overflow-hidden bg-[#102a56] px-5 py-6 text-white sm:px-7 sm:py-7">
          <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10">
                <Building2 className="h-5 w-5 text-blue-200" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">{company.name}</h2>
                  <Badge tone="green">Active</Badge>
                </div>
                <p className="mt-1 text-xs text-blue-100/60">{company.legalName || "Legal name not set"}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-100/55">
                  <span>{company.code}</span>
                  <span>{company.currencyCode}</span>
                  <span>{company.timeZone}</span>
                  <span>
                    {company.city || "City not set"}, {company.countryCode}
                  </span>
                </p>
              </div>
            </div>
            {canEditCompany ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setCompanyForm(companyToForm(company));
                  setCompanyOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                Company settings
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[
            { label: "Active branches", value: branches.filter((item) => item.isActive).length, icon: Store },
            { label: "Warehouses", value: warehouses.filter((item) => item.isActive).length, icon: WarehouseIcon },
            {
              label: "Storage locations",
              value: warehouses.reduce((sum, item) => sum + (item._count?.locations || 0), 0),
              icon: MapPin,
            },
            {
              label: "Departments",
              value: departments.filter((item) => item.isActive).length,
              icon: FolderTree,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-slate-500">
                <item.icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">{item.label}</span>
                <span className="mt-0.5 block text-sm font-bold text-slate-800">{item.value}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-6">
          {["branches", "warehouses", "departments"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`border-b-2 px-1 pb-3 text-xs font-semibold transition ${
                tab === item
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              {titleCase(item)}
            </button>
          ))}
        </div>
        {tab === "branches" && canCreateBranch ? (
          <Button size="sm" onClick={openNewBranch}>
            <Plus className="h-3.5 w-3.5" />
            New branch
          </Button>
        ) : null}
        {tab === "warehouses" && canCreateWarehouse ? (
          <Button size="sm" onClick={openNewWarehouse}>
            <Plus className="h-3.5 w-3.5" />
            New warehouse
          </Button>
        ) : null}
        {tab === "departments" && canCreateBranch ? (
          <Button size="sm" onClick={openNewDepartment}>
            <Plus className="h-3.5 w-3.5" />
            New department
          </Button>
        ) : null}
      </div>

      {tab === "branches" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => (
            <article key={branch.id} className="surface p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Store className="h-[18px] w-[18px]" />
                </span>
                <div className="flex gap-1">
                  {canEditBranch ? (
                    <button
                      onClick={() => openEditBranch(branch)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                      aria-label="Edit branch"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                  {canArchiveBranch ? (
                    <button
                      onClick={() => archiveBranch(branch)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Archive branch"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <h3 className="font-bold text-slate-800">{branch.name}</h3>
                <Badge tone={branch.isActive ? "green" : "amber"}>{branch.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {branch.code} · {titleCase(branch.type)}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-[9px] uppercase tracking-wide text-slate-400">Document prefix</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-700">{branch.documentPrefix}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-[9px] uppercase tracking-wide text-slate-400">Warehouses</p>
                  <p className="mt-1 text-xs font-bold text-slate-700">{branch._count?.warehouses || 0}</p>
                </div>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                {[branch.city, branch.province].filter(Boolean).join(", ") || "Address not set"}
              </p>
            </article>
          ))}
        </div>
      ) : tab === "warehouses" ? (
        <div className="surface mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Operations</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id} className="hover:bg-slate-50/60">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
                        <WarehouseIcon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-800">{warehouse.name}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{warehouse.code}</span>
                      </span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="text-xs text-slate-600">{warehouse.branch.name}</span>
                    <span className="ml-2 text-[9px] text-slate-400">{warehouse.branch.code}</span>
                  </td>
                  <td className="table-cell">
                    <Badge tone="slate">{titleCase(warehouse.type)}</Badge>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      {warehouse.allowReceiving ? (
                        <span title="Receiving enabled">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </span>
                      ) : (
                        <CircleOff className="h-4 w-4 text-slate-300" />
                      )}
                      {warehouse.allowDispatch ? (
                        <span className="text-[10px] text-slate-500">Dispatch</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">No dispatch</span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell text-xs text-slate-600">{warehouse._count?.locations || 0}</td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      {warehouse.isDefault ? <Badge tone="blue">Default</Badge> : null}
                      <Badge tone={warehouse.isActive ? "green" : "amber"}>
                        {warehouse.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex justify-end gap-1">
                      {canEditWarehouse ? (
                        <button
                          onClick={() => openEditWarehouse(warehouse)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canArchiveWarehouse ? (
                        <button
                          onClick={() => archiveWarehouse(warehouse)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="surface mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Code / Name</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">References</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!departments.length ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-slate-400">
                    No departments configured yet. Click "New department" above to create one.
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-slate-50/60">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                          <FolderTree className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block font-semibold text-slate-800">{dept.name}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{dept.code}</span>
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="text-xs text-slate-600">
                        {dept.branch ? `${dept.branch.code} · ${dept.branch.name}` : "Company-wide"}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-slate-500">
                      {(dept._count?.journalLines || 0)} GL lines · {(dept._count?.assets || 0)} assets ·{" "}
                      {(dept._count?.budgets || 0)} budgets
                    </td>
                    <td className="table-cell">
                      <Badge tone={dept.isActive ? "green" : "amber"}>{dept.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1">
                        {canEditBranch ? (
                          <button
                            onClick={() => openEditDepartment(dept)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit department"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canArchiveBranch ? (
                          <button
                            onClick={() => void archiveDepartment(dept)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Deactivate / Remove"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Company settings modal */}
      <Modal
        open={companyOpen}
        onClose={() => setCompanyOpen(false)}
        title="Company settings"
        description="Changes are company-scoped and written to the protected audit trail."
        size="xl"
      >
        <form onSubmit={saveCompany}>
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InputField
              label="Company name"
              value={companyForm.name}
              onChange={(value) => setCompanyForm({ ...companyForm, name: value })}
              required
            />
            <InputField
              label="Legal name"
              value={companyForm.legalName}
              onChange={(value) => setCompanyForm({ ...companyForm, legalName: value })}
            />
            <InputField
              label="Registration number"
              value={companyForm.registrationNumber}
              onChange={(value) => setCompanyForm({ ...companyForm, registrationNumber: value })}
            />
            <InputField
              label="Tax registration"
              value={companyForm.taxRegistrationNumber}
              onChange={(value) => setCompanyForm({ ...companyForm, taxRegistrationNumber: value })}
            />
            <InputField
              label="Email"
              type="email"
              value={companyForm.email}
              onChange={(value) => setCompanyForm({ ...companyForm, email: value })}
            />
            <InputField
              label="Phone"
              value={companyForm.phone}
              onChange={(value) => setCompanyForm({ ...companyForm, phone: value })}
            />
            <InputField
              label="Address line 1"
              value={companyForm.addressLine1}
              onChange={(value) => setCompanyForm({ ...companyForm, addressLine1: value })}
            />
            <InputField
              label="Address line 2"
              value={companyForm.addressLine2}
              onChange={(value) => setCompanyForm({ ...companyForm, addressLine2: value })}
            />
            <InputField
              label="City"
              value={companyForm.city}
              onChange={(value) => setCompanyForm({ ...companyForm, city: value })}
            />
            <InputField
              label="Province"
              value={companyForm.province}
              onChange={(value) => setCompanyForm({ ...companyForm, province: value })}
            />
            <InputField
              label="Country code"
              value={companyForm.countryCode}
              onChange={(value) => setCompanyForm({ ...companyForm, countryCode: value.toUpperCase() })}
              required
            />
            <InputField
              label="Currency"
              value={companyForm.currencyCode}
              onChange={(value) => setCompanyForm({ ...companyForm, currencyCode: value.toUpperCase() })}
              required
            />
            <InputField
              label="Time zone"
              value={companyForm.timeZone}
              onChange={(value) => setCompanyForm({ ...companyForm, timeZone: value })}
              required
            />
            <SelectField
              label="Fiscal year starts"
              value={String(companyForm.fiscalYearStartMonth)}
              onChange={(value) => setCompanyForm({ ...companyForm, fiscalYearStartMonth: Number(value) })}
              options={monthOptions}
            />
            <SelectField
              label="Costing method"
              value={companyForm.inventoryCostingMethod}
              onChange={(value) => setCompanyForm({ ...companyForm, inventoryCostingMethod: value })}
              options={[
                { value: "SPECIFIC", label: "Specific unit cost" },
                { value: "FIFO", label: "FIFO" },
                { value: "WEIGHTED_AVERAGE", label: "Weighted average" },
              ]}
            />
            <SelectField
              label="Decimal precision"
              value={String(companyForm.decimalPrecision)}
              onChange={(value) => setCompanyForm({ ...companyForm, decimalPrecision: Number(value) })}
              options={[0, 2, 3, 4].map((value) => ({ value: String(value), label: String(value) }))}
            />
            <label className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4 sm:col-span-2 lg:col-span-3">
              <input
                type="checkbox"
                className="rounded border-red-300 text-red-600 focus:ring-red-500"
                checked={companyForm.allowNegativeStock}
                onChange={(event) => setCompanyForm({ ...companyForm, allowNegativeStock: event.target.checked })}
              />
              <span>
                <span className="block text-xs font-bold text-red-800">Allow negative stock</span>
                <span className="mt-0.5 block text-[10px] text-red-600">
                  Keep disabled unless an explicitly approved and audited business policy requires it.
                </span>
              </span>
            </label>
          </div>
          <FormFooter saving={saving} onCancel={() => setCompanyOpen(false)} label="Save company settings" />
        </form>
      </Modal>

      {/* Branch modal */}
      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={editingBranch ? "Edit branch" : "Create branch"}
        description="Document prefixes are unique within the company."
        size="lg"
      >
        <form onSubmit={saveBranch}>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <InputField
              label="Branch code"
              value={branchForm.code}
              onChange={(value) => setBranchForm({ ...branchForm, code: value.toUpperCase() })}
              required
            />
            <InputField
              label="Branch name"
              value={branchForm.name}
              onChange={(value) => setBranchForm({ ...branchForm, name: value })}
              required
            />
            <SelectField
              label="Branch type"
              value={branchForm.type}
              onChange={(value) => setBranchForm({ ...branchForm, type: value })}
              options={["HEAD_OFFICE", "RETAIL_STORE", "WHOLESALE", "DISTRIBUTION_CENTER"].map((value) => ({
                value,
                label: titleCase(value),
              }))}
            />
            <InputField
              label="Document prefix"
              value={branchForm.documentPrefix}
              onChange={(value) => setBranchForm({ ...branchForm, documentPrefix: value.toUpperCase() })}
              required
            />
            <InputField
              label="City"
              value={branchForm.city}
              onChange={(value) => setBranchForm({ ...branchForm, city: value })}
            />
            <InputField
              label="Province"
              value={branchForm.province}
              onChange={(value) => setBranchForm({ ...branchForm, province: value })}
            />
            <InputField
              label="Phone"
              value={branchForm.phone}
              onChange={(value) => setBranchForm({ ...branchForm, phone: value })}
            />
            <InputField
              label="Email"
              type="email"
              value={branchForm.email}
              onChange={(value) => setBranchForm({ ...branchForm, email: value })}
            />
            <CheckboxField
              label="Branch is active"
              checked={branchForm.isActive}
              onChange={(value) => setBranchForm({ ...branchForm, isActive: value })}
            />
          </div>
          <FormFooter
            saving={saving}
            onCancel={() => setBranchOpen(false)}
            label={editingBranch ? "Save branch" : "Create branch"}
          />
        </form>
      </Modal>

      {/* Warehouse modal */}
      <Modal
        open={warehouseOpen}
        onClose={() => setWarehouseOpen(false)}
        title={editingWarehouse ? "Edit warehouse" : "Create warehouse"}
        description="Warehouses are always tied to a branch in the same company."
        size="lg"
      >
        <form onSubmit={saveWarehouse}>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <SelectField
              label="Branch"
              value={warehouseForm.branchId}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, branchId: value })}
              options={branches
                .filter((item) => item.isActive)
                .map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))}
            />
            <InputField
              label="Warehouse code"
              value={warehouseForm.code}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, code: value.toUpperCase() })}
              required
            />
            <InputField
              label="Warehouse name"
              value={warehouseForm.name}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, name: value })}
              required
            />
            <SelectField
              label="Warehouse type"
              value={warehouseForm.type}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, type: value })}
              options={["MAIN", "RETAIL", "TRANSIT", "QUARANTINE", "DAMAGED", "SERVICE"].map((value) => ({
                value,
                label: titleCase(value),
              }))}
            />
            <InputField
              label="City"
              value={warehouseForm.city}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, city: value })}
            />
            <InputField
              label="Phone"
              value={warehouseForm.phone}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, phone: value })}
            />
            <CheckboxField
              label="Receiving enabled"
              checked={warehouseForm.allowReceiving}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, allowReceiving: value })}
            />
            <CheckboxField
              label="Dispatch enabled"
              checked={warehouseForm.allowDispatch}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, allowDispatch: value })}
            />
            <CheckboxField
              label="Company default warehouse"
              checked={warehouseForm.isDefault}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, isDefault: value })}
            />
            <CheckboxField
              label="Warehouse is active"
              checked={warehouseForm.isActive}
              onChange={(value) => setWarehouseForm({ ...warehouseForm, isActive: value })}
            />
          </div>
          <FormFooter
            saving={saving}
            onCancel={() => setWarehouseOpen(false)}
            label={editingWarehouse ? "Save warehouse" : "Create warehouse"}
          />
        </form>
      </Modal>

      {/* Department modal */}
      <Modal
        open={departmentOpen}
        onClose={() => setDepartmentOpen(false)}
        title={editingDepartment ? "Edit department" : "Create department"}
        description="Departments can be company-wide or branch-scoped."
        size="md"
      >
        <form onSubmit={saveDepartment}>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <InputField
              label="Department code"
              value={departmentForm.code}
              onChange={(value) => setDepartmentForm({ ...departmentForm, code: value.toUpperCase() })}
              required
            />
            <InputField
              label="Department name"
              value={departmentForm.name}
              onChange={(value) => setDepartmentForm({ ...departmentForm, name: value })}
              required
            />
            <div className="sm:col-span-2">
              <SelectField
                label="Branch assignment"
                value={departmentForm.branchId}
                onChange={(value) => setDepartmentForm({ ...departmentForm, branchId: value })}
                options={[
                  { value: "", label: "Company-wide" },
                  ...branches
                    .filter((item) => item.isActive)
                    .map((item) => ({ value: item.id, label: `${item.name} (${item.code})` })),
                ]}
              />
            </div>
            <div className="sm:col-span-2">
              <CheckboxField
                label="Department is active"
                checked={departmentForm.isActive}
                onChange={(value) => setDepartmentForm({ ...departmentForm, isActive: value })}
              />
            </div>
          </div>
          <FormFooter
            saving={saving}
            onCancel={() => setDepartmentOpen(false)}
            label={editingDepartment ? "Save department" : "Create department"}
          />
        </form>
      </Modal>
    </>
  );
}

function companyToForm(company: Company) {
  return {
    name: company.name,
    legalName: company.legalName || "",
    registrationNumber: company.registrationNumber || "",
    taxRegistrationNumber: company.taxRegistrationNumber || "",
    addressLine1: company.addressLine1 || "",
    addressLine2: company.addressLine2 || "",
    countryCode: company.countryCode,
    province: company.province || "",
    city: company.city || "",
    postalCode: company.postalCode || "",
    phone: company.phone || "",
    email: company.email || "",
    currencyCode: company.currencyCode,
    timeZone: company.timeZone,
    fiscalYearStartMonth: company.fiscalYearStartMonth,
    decimalPrecision: company.decimalPrecision,
    inventoryCostingMethod: company.inventoryCostingMethod,
    allowNegativeStock: company.allowNegativeStock,
  };
}
const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

function InputField({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <input
        type={type}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-3 rounded-lg border border-slate-200 px-3">
      <input
        type="checkbox"
        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </label>
  );
}

function FormFooter({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={saving}>
        {label}
      </Button>
    </div>
  );
}
