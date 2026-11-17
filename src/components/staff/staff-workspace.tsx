"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Building2,
  Phone,
  Mail,
  Award,
  TrendingUp,
  ShoppingBag,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";

type StaffItem = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  status: "ACTIVE" | "SUSPENDED" | "ENDED";
  userStatus: string;
  joinedAt: string;
  userId: string;
  isOwner: boolean;
  isSalesperson: boolean;
  role: { id: string; code: string; name: string } | null;
  branch: { id: string; code: string; name: string } | null;
  allRoles: Array<{ roleCode: string; roleName: string; branchCode: string }>;
  salesCount: number;
  totalSalesAmount: number;
  totalGrossProfit: number;
  totalEarnedIncentive: number;
};

type Branch = { id: string; code: string; name: string };
type Role = { id: string; code: string; name: string };

export function StaffWorkspace() {
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [salespersonOnly, setSalespersonOnly] = useState(false);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewStaff, setViewStaff] = useState<StaffItem | null>(null);
  const [staffProfileData, setStaffProfileData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<"overview" | "sales" | "incentives">("overview");

  // Form state
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    employeeCode: "",
    jobTitle: "Sales Executive",
    branchId: "",
    roleCode: "SALESPERSON",
    temporaryPassword: "",
  });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffRes, branchRes, roleRes] = await Promise.all([
        fetch("/api/staff"),
        fetch("/api/branches"),
        fetch("/api/roles"),
      ]);

      if (staffRes.ok) {
        const json = await staffRes.json();
        setStaff(json.data || []);
      }
      if (branchRes.ok) {
        const json = await branchRes.json();
        setBranches(json.data || []);
      }
      if (roleRes.ok) {
        const json = await roleRes.json();
        setRoles(json.data || []);
      }
    } catch {
      toast.error("Failed to load staff records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openProfile = async (item: StaffItem) => {
    setViewStaff(item);
    setProfileLoading(true);
    setProfileTab("overview");
    try {
      const res = await fetch(`/api/staff/${item.id}`);
      if (res.ok) {
        const json = await res.json();
        setStaffProfileData(json.data);
      }
    } catch {
      toast.error("Failed to load staff performance profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim()) {
      toast.error("Please enter employee name and email address.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to create staff record.");
      }
      toast.success("Staff member created successfully!");
      setAddModalOpen(false);
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        employeeCode: "",
        jobTitle: "Sales Executive",
        branchId: "",
        roleCode: "SALESPERSON",
        temporaryPassword: "",
      });
      void loadData();
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(err.message || "Failed to create staff member.");
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter((item) => {
      const matchesSearch =
        search === "" ||
        item.fullName.toLowerCase().includes(search.toLowerCase()) ||
        item.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
        item.email.toLowerCase().includes(search.toLowerCase()) ||
        item.jobTitle.toLowerCase().includes(search.toLowerCase());

      const matchesBranch =
        selectedBranch === "ALL" ||
        item.branch?.id === selectedBranch ||
        item.allRoles.some((r) => r.branchCode === selectedBranch);

      const matchesStatus =
        selectedStatus === "ALL" || item.status === selectedStatus;

      const matchesSalesperson = !salespersonOnly || item.isSalesperson;

      return matchesSearch && matchesBranch && matchesStatus && matchesSalesperson;
    });
  }, [staff, search, selectedBranch, selectedStatus, salespersonOnly]);

  const totalSalesOverall = useMemo(
    () => staff.reduce((acc, s) => acc + s.totalSalesAmount, 0),
    [staff]
  );
  const totalIncentivesOverall = useMemo(
    () => staff.reduce((acc, s) => acc + s.totalEarnedIncentive, 0),
    [staff]
  );
  const totalSalespeopleCount = useMemo(
    () => staff.filter((s) => s.isSalesperson).length,
    [staff]
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Staff & Employee Directory
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            Operational staff profiles, branch assignments, sales performance, and earned incentives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} loading={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Staff</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{staff.length}</p>
          <span className="text-[11px] text-slate-400">Company-wide active directory</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Sales Personnel</span>
            <ShoppingBag className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{totalSalespeopleCount}</p>
          <span className="text-[11px] text-slate-400">Assigned salesperson designation</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Generated Sales</span>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(totalSalesOverall)}</p>
          <span className="text-[11px] text-slate-400">Attributed to sales staff</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Earned Incentives</span>
            <Award className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(totalIncentivesOverall)}</p>
          <span className="text-[11px] text-slate-400">Performance commission earned</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, employee code, email, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ENDED">Resigned / Ended</option>
          </select>

          <button
            type="button"
            onClick={() => setSalespersonOnly(!salespersonOnly)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              salespersonOnly
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Salespeople Only
          </button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Designation & Role</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Sales Posted</th>
                <th className="px-4 py-3 text-right font-semibold">Total Revenue</th>
                <th className="px-4 py-3 text-right font-semibold">Incentives</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Loading staff directory...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No staff members match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{item.fullName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{item.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{item.jobTitle}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.role?.name || item.allRoles[0]?.roleName || "Standard User"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        {item.branch ? `${item.branch.code} · ${item.branch.name}` : "Company-Wide"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{item.phone}</div>
                      <div className="text-[11px] text-slate-400">{item.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          item.status === "ACTIVE"
                            ? "green"
                            : item.status === "SUSPENDED"
                            ? "amber"
                            : "slate"
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {item.salesCount} invoices
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {item.totalSalesAmount > 0 ? formatMoney(item.totalSalesAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">
                      {item.totalEarnedIncentive > 0 ? formatMoney(item.totalEarnedIncentive) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openProfile(item)}
                        className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Profile
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Staff Member"
        description="Register a new employee into the operational staff directory and assign permissions."
      >
        <form onSubmit={handleCreateStaff} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Muhammad Usman"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Employee ID / Code</label>
              <input
                type="text"
                placeholder="e.g. EMP-003 (Auto if blank)"
                value={formData.employeeCode}
                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Email Address *</label>
              <input
                type="email"
                required
                placeholder="staff@axonmobile.local"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Phone / WhatsApp</label>
              <input
                type="text"
                placeholder="0300-1234567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Job Title / Designation *</label>
              <input
                type="text"
                required
                placeholder="e.g. Senior Salesperson"
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Assigned Branch</label>
              <select
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Company-Wide (All Branches)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">System Role</label>
              <select
                value={formData.roleCode}
                onChange={(e) => setFormData({ ...formData, roleCode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="SALESPERSON">Salesperson (POS & Counter Sales)</option>
                <option value="CASHIER">Cashier (POS Checkout & Receipts)</option>
                <option value="STOREKEEPER">Storekeeper (Warehouse & Transfers)</option>
                <option value="INVENTORY_MANAGER">Inventory Manager</option>
                <option value="PURCHASE_OFFICER">Purchase Officer</option>
                <option value="ACCOUNTANT">Accountant</option>
                <option value="BRANCH_MANAGER">Branch Manager</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Temporary Password</label>
              <input
                type="password"
                placeholder="Default: AxonStaff@2026!"
                value={formData.temporaryPassword}
                onChange={(e) => setFormData({ ...formData, temporaryPassword: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Register Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Staff Profile & Performance Modal */}
      {viewStaff && (
        <Modal
          open={Boolean(viewStaff)}
          onClose={() => setViewStaff(null)}
          title={`Staff Profile · ${viewStaff.fullName}`}
          description={`${viewStaff.employeeCode} · ${viewStaff.jobTitle} · ${viewStaff.branch ? `${viewStaff.branch.code} - ${viewStaff.branch.name}` : "Company-Wide"}`}
        >
          <div className="space-y-4 pt-1">
            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setProfileTab("overview")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  profileTab === "overview"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Overview & KPIs
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("sales")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  profileTab === "sales"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Sales Invoices ({staffProfileData?.recentSales?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("incentives")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  profileTab === "incentives"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Earned Incentives ({staffProfileData?.incentiveHistory?.length || 0})
              </button>
            </div>

            {profileLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading performance data...</div>
            ) : staffProfileData ? (
              <div>
                {profileTab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500">Total Sales</span>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {formatMoney(staffProfileData.kpis.totalSalesAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500">Gross Profit</span>
                        <p className="mt-1 text-sm font-bold text-emerald-700">
                          {formatMoney(staffProfileData.kpis.totalGrossProfit)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500">Incentives Earned</span>
                        <p className="mt-1 text-sm font-bold text-amber-700">
                          {formatMoney(staffProfileData.kpis.totalEarnedIncentive)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500">Outstanding Commission</span>
                        <p className="mt-1 text-sm font-bold text-blue-700">
                          {formatMoney(staffProfileData.kpis.totalOutstandingIncentive)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-100 p-3 text-xs">
                      <h4 className="font-semibold text-slate-800">Employment Details</h4>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                        <div>
                          <span className="text-slate-400">Employee ID:</span> {staffProfileData.membership.employeeCode}
                        </div>
                        <div>
                          <span className="text-slate-400">Status:</span> {staffProfileData.membership.status}
                        </div>
                        <div>
                          <span className="text-slate-400">Email:</span> {staffProfileData.user.email}
                        </div>
                        <div>
                          <span className="text-slate-400">Phone:</span> {staffProfileData.user.phone || "—"}
                        </div>
                        <div>
                          <span className="text-slate-400">Joining Date:</span> {formatDate(staffProfileData.membership.joinedAt)}
                        </div>
                        <div>
                          <span className="text-slate-400">Designation:</span> {staffProfileData.membership.jobTitle}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {profileTab === "sales" && (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="py-2">Date</th>
                          <th className="py-2">Invoice #</th>
                          <th className="py-2">Customer</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staffProfileData.recentSales.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-slate-400">
                              No sales invoices attributed to this staff member yet.
                            </td>
                          </tr>
                        ) : (
                          staffProfileData.recentSales.map((inv: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <tr key={inv.id}>
                              <td className="py-2 text-slate-500">{formatDate(inv.invoiceDate)}</td>
                              <td className="py-2 font-mono font-medium text-slate-900">{inv.invoiceNumber}</td>
                              <td className="py-2 text-slate-700">{inv.customer?.name}</td>
                              <td className="py-2 text-right font-semibold text-slate-900">{formatMoney(inv.grandTotal)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {profileTab === "incentives" && (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="py-2">Plan</th>
                          <th className="py-2">Period</th>
                          <th className="py-2 text-right">Amount</th>
                          <th className="py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staffProfileData.incentiveHistory.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-slate-400">
                              No incentives calculated for this staff member yet.
                            </td>
                          </tr>
                        ) : (
                          staffProfileData.incentiveHistory.map((inc: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <tr key={inc.id}>
                              <td className="py-2 font-medium text-slate-900">{inc.plan?.name}</td>
                              <td className="py-2 text-slate-500">
                                {formatDate(inc.periodStart)} – {formatDate(inc.periodEnd)}
                              </td>
                              <td className="py-2 text-right font-semibold text-amber-700">
                                {formatMoney(inc.approvedAmount || inc.calculatedAmount)}
                              </td>
                              <td className="py-2 text-center">
                                <Badge tone="blue">{inc.status}</Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setViewStaff(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

