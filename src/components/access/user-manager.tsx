"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, KeyRound, MoreHorizontal, Pencil, Plus, Search, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { formatDate, initials } from "@/lib/utils";

type Role = { id: string; code: string; name: string; isSystem: boolean };
type Branch = { id: string; code: string; name: string };
type Warehouse = { id: string; branchId: string; code: string; name: string };
type Membership = {
  id: string;
  status: string;
  isOwner: boolean;
  employeeCode: string | null;
  user: { id: string; fullName: string; email: string; phone: string | null; lastLoginAt: Date | string | null; forcePasswordChange: boolean };
  userRoles: Array<{ id: string; role: Role; branch: Branch | null; warehouse: Warehouse | null }>;
};

type Form = {
  fullName: string;
  email: string;
  phone: string;
  temporaryPassword: string;
  status: "ACTIVE" | "SUSPENDED";
  roleId: string;
  branchId: string;
  warehouseId: string;
};

function generatePassword() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return `Ax!${Array.from(bytes).map((value) => value.toString(36)).join("").slice(0, 15)}9Z`;
}

export function UserManager({ initialMemberships, roles, branches, warehouses, permissions, currentUserId }: { initialMemberships: Membership[]; roles: Role[]; branches: Branch[]; warehouses: Warehouse[]; permissions: string[]; currentUserId: string }) {
  const searchParams = useSearchParams();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<Form>(() => newForm(roles));

  const canCreate = permissions.includes("access.user.create") && permissions.includes("access.user.assign_role");
  const canEdit = permissions.includes("access.user.edit") && permissions.includes("access.user.assign_role");

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreate) openCreate();
    const editId = searchParams.get("edit");
    if (editId && canEdit) {
      const target = memberships.find((m) => m.user.id === editId || m.id === editId);
      if (target) openEdit(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => memberships.filter((membership) => {
    const text = `${membership.user.fullName} ${membership.user.email} ${membership.employeeCode || ""}`.toLowerCase();
    const roleMatch = !roleFilter || membership.userRoles.some((assignment) => assignment.role.id === roleFilter);
    const statusMatch = !statusFilter || membership.status === statusFilter;
    return text.includes(search.toLowerCase()) && roleMatch && statusMatch;
  }), [memberships, search, roleFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(newForm(roles));
    setCopied(false);
    setFormOpen(true);
  }

  function openEdit(membership: Membership) {
    const assignment = membership.userRoles[0];
    setEditing(membership);
    setForm({
      fullName: membership.user.fullName,
      email: membership.user.email,
      phone: membership.user.phone || "",
      temporaryPassword: "",
      status: membership.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      roleId: assignment?.role.id || roles[0]?.id || "",
      branchId: assignment?.branch?.id || assignment?.warehouse?.branchId || "",
      warehouseId: assignment?.warehouse?.id || "",
    });
    setFormOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = editing
      ? { fullName: form.fullName, phone: form.phone, status: form.status, roleId: form.roleId, branchId: form.branchId || null, warehouseId: form.warehouseId || null }
      : { fullName: form.fullName, email: form.email, phone: form.phone, temporaryPassword: form.temporaryPassword, roleId: form.roleId, branchId: form.branchId || null, warehouseId: form.warehouseId || null };
    const response = await fetch(editing ? `/api/users/${editing.user.id}` : "/api/users", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    toast.success(editing ? "User access updated" : "User created with mandatory password change");
    setFormOpen(false);
    const refresh = await fetch("/api/users");
    if (refresh.ok) setMemberships((await refresh.json()).data);
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(form.temporaryPassword);
    setCopied(true);
    toast.success("Temporary password copied");
    setTimeout(() => setCopied(false), 1500);
  }

  const selectedBranchWarehouses = warehouses.filter((warehouse) => !form.branchId || warehouse.branchId === form.branchId);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[{ label: "Active memberships", value: memberships.filter((item) => item.status === "ACTIVE").length, detail: "can authenticate", tone: "bg-emerald-50 text-emerald-700" }, { label: "Role profiles", value: roles.length, detail: "system & custom", tone: "bg-violet-50 text-violet-700" }, { label: "Scoped assignments", value: memberships.filter((item) => item.userRoles.some((role) => role.branch || role.warehouse)).length, detail: "branch or warehouse", tone: "bg-blue-50 text-blue-700" }].map((item) => <div key={item.label} className="surface p-5"><div className={`mb-4 grid h-9 w-9 place-items-center rounded-lg ${item.tone}`}><Shield className="h-4 w-4" /></div><p className="text-2xl font-bold text-slate-900">{item.value}</p><p className="mt-1 text-xs font-semibold text-slate-700">{item.label}</p><p className="mt-1 text-[10px] text-slate-400">{item.detail}</p></div>)}
      </div>

      <div className="surface mt-5 overflow-visible">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row"><div className="relative max-w-md flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search name, email, employee code…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="select min-w-44" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select className="select min-w-36" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></div>
          {canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4" />Add user</Button> : null}
        </div>
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[940px]"><thead className="table-head"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Access scope</th><th className="px-4 py-3">Last sign-in</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{filtered.map((membership) => {
          const assignment = membership.userRoles[0];
          return <tr key={membership.id} className="hover:bg-slate-50/60"><td className="table-cell"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-forest-100 text-[11px] font-bold text-forest-800">{initials(membership.user.fullName)}</span><span><span className="block font-semibold text-slate-800">{membership.user.fullName}{membership.user.id === currentUserId ? <span className="ml-2 text-[9px] font-semibold text-forest-700">YOU</span> : null}</span><span className="mt-0.5 block text-[10px] text-slate-400">{membership.user.email}</span></span></div></td><td className="table-cell"><span className="text-xs font-semibold text-slate-700">{assignment?.role.name || "No role"}</span><span className="mt-1 block font-mono text-[9px] text-slate-400">{assignment?.role.code}</span></td><td className="table-cell"><span className="text-xs text-slate-600">{assignment?.warehouse?.name || assignment?.branch?.name || "All company locations"}</span><span className="mt-1 block text-[9px] text-slate-400">{assignment?.warehouse ? "Warehouse scope" : assignment?.branch ? "Branch scope" : "Company scope"}</span></td><td className="table-cell text-xs text-slate-500">{membership.user.lastLoginAt ? formatDate(membership.user.lastLoginAt, true) : "Never"}</td><td className="table-cell"><div className="flex flex-wrap gap-1"><Badge tone={membership.status === "ACTIVE" ? "green" : "red"}>{membership.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>{membership.user.forcePasswordChange ? <Badge tone="amber">Password change</Badge> : null}{membership.isOwner ? <Badge tone="purple">Owner</Badge> : null}</div></td><td className="table-cell text-right">{canEdit ? <button onClick={() => openEdit(membership)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit access"><Pencil className="h-4 w-4" /></button> : <MoreHorizontal className="ml-auto h-4 w-4 text-slate-300" />}</td></tr>;
        })}</tbody></table></div> : <EmptyState icon={Users} title="No users match" description="Change your filters or create a scoped user account." />}
        <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">{filtered.length} of {memberships.length} company memberships</div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit user access" : "Create user"} description={editing ? "Changes are enforced at the API and session layer." : "The user must replace the temporary password at first sign-in."} size="lg">
        <form onSubmit={save}>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Full name" required><input className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></Field>
            <Field label="Email" required><input className="input" type="email" disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            {editing ? <Field label="Membership status"><select className="select" disabled={editing.isOwner || editing.user.id === currentUserId} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "ACTIVE" | "SUSPENDED" })}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></Field> : <Field label="Temporary password" required><div className="flex gap-2"><input className="input font-mono text-xs" value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} required minLength={12} /><Button type="button" variant="outline" size="icon" onClick={copyPassword}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</Button></div></Field>}
            <Field label="Role" required><select className="select" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.filter((role) => !editing?.isOwner || role.code === "OWNER").map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
            <Field label="Branch scope"><select className="select" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value, warehouseId: "" })}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></Field>
            <Field label="Warehouse scope"><select className="select" value={form.warehouseId} onChange={(event) => { const warehouse = warehouses.find((item) => item.id === event.target.value); setForm({ ...form, warehouseId: event.target.value, branchId: warehouse?.branchId || form.branchId }); }}><option value="">All warehouses in scope</option>{selectedBranchWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex gap-3"><KeyRound className="mt-0.5 h-4 w-4 text-blue-700" /><p className="text-[11px] leading-5 text-blue-800">Role grants are evaluated on every server request. Branch and warehouse scope is applied in addition to the role’s action permissions; hiding a button is never the security boundary.</p></div></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>{editing ? "Save access" : "Create user"}</Button></div>
        </form>
      </Modal>
    </>
  );
}

function newForm(roles: Role[]): Form {
  return { fullName: "", email: "", phone: "", temporaryPassword: typeof window === "undefined" ? "" : generatePassword(), status: "ACTIVE", roleId: roles.find((role) => role.code === "READ_ONLY")?.id || roles[0]?.id || "", branchId: "", warehouseId: "" };
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div><label className="label">{label}{required ? <span className="ml-1 text-red-500">*</span> : null}</label>{children}</div>; }
