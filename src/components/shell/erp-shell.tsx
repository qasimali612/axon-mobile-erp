"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Command,
  FileClock,
  LayoutDashboard,
  Landmark,
  Loader2,
  ChartNoAxesCombined,
  WalletCards,
  BadgeDollarSign,
  CalendarCheck2,
  Menu,
  PackageSearch,
  Plus,
  Search,
  Scale,
  ShoppingCart,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  Warehouse,
  X,
  Zap,
  LogOut,
  Settings2,
  Tags,
  CreditCard,
  Factory,
  Layers,
  FileCheck2,
  Receipt,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { cn, formatDate, initials } from "@/lib/utils";

type Context = {
  sessionId: string;
  user: { id: string; email: string; fullName: string; forcePasswordChange: boolean };
  company: { id: string; code: string; name: string; currencyCode: string; timeZone: string };
  activeBranchId: string | null;
  activeWarehouseId: string | null;
  permissions: string[];
  roles: Array<{ id: string; name: string; code: string; branchId: string | null; warehouseId: string | null; permissions: string[] }>;
};

type Branch = {
  id: string;
  code: string;
  name: string;
  warehouses: Array<{ id: string; code: string; name: string; type: string }>;
};

type Notification = {
  id: string;
  title: string;
  message: string;
  severity: string;
  actionUrl: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

type GlobalSearchGroup = {
  type: string;
  label: string;
  items: Array<{ id: string; type: string; title: string; subtitle: string; href: string; badge?: string }>;
};

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: string | string[];
  exact?: boolean;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [{ label: "Overview", href: "/", icon: LayoutDashboard, permission: "dashboard.view", exact: true }],
  },
  {
    label: "Foundation",
    items: [
      { label: "Product catalog", href: "/catalog/products", icon: PackageSearch, permission: "catalog.product.view" },
      { label: "Catalog masters", href: "/catalog/masters", icon: Settings2, permission: "catalog.product.view" },
      { label: "Price lists", href: "/catalog/price-lists", icon: Tags, permission: "catalog.pricelist.view" },
      { label: "Supplier item codes", href: "/catalog/supplier-items", icon: Tags, permission: "catalog.product.view" },
      { label: "Payment methods", href: "/catalog/payment-methods", icon: CreditCard, permission: "finance.paymentmethod.view" },
      { label: "Document numbering", href: "/settings/sequences", icon: Command, permission: "policy.manage" },
      { label: "Organization", href: "/organization", icon: Building2, permission: "organization.branch.view" },
      { label: "Warehouse locations", href: "/organization/locations", icon: Warehouse, permission: "organization.warehouse.view" },
      { label: "Warehouse dashboard", href: "/organization/warehouse-dashboard", icon: ChartNoAxesCombined, permission: "organization.warehouse.view" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Inventory dashboard", href: "/inventory/dashboard", icon: ChartNoAxesCombined, permission: "inventory.stock.view" },
      { label: "Stock overview", href: "/inventory", icon: Boxes, permission: "inventory.stock.view", exact: true },
      { label: "Stock transfers", href: "/inventory/transfers", icon: ArrowLeftRight, permission: "inventory.transfer.view" },
      { label: "Stock adjustments", href: "/inventory/adjustments", icon: Scale, permission: "inventory.stock.view" },
      { label: "Physical stock counts", href: "/inventory/stock-counts", icon: ClipboardList, permission: "inventory.stock.view" },
      { label: "IMEI search & registry", href: "/inventory/imei", icon: Smartphone, permission: "inventory.device.view" },
      { label: "Device labels", href: "/inventory/labels", icon: Tags, permission: "inventory.device.view" },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      { label: "Production dashboard", href: "/production/dashboard", icon: Factory, permission: "production.view" },
      { label: "Production orders", href: "/production", icon: ClipboardList, permission: "production.view", exact: true },
      { label: "Bills of Materials", href: "/production/boms", icon: Layers, permission: "production.view" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Purchase dashboard", href: "/purchases/dashboard", icon: ChartNoAxesCombined, permission: "purchase.view" },
      { label: "Purchase orders", href: "/purchases", icon: ClipboardList, permission: "purchase.view", exact: true },
      { label: "Purchase / receive stock", href: "/goods-receipts/new", icon: Plus, permission: "PURCHASE_RECEIPT_CREATE", exact: true },
      { label: "Goods receipt register", href: "/goods-receipts", icon: Warehouse, permission: "purchase.view", exact: true },
      { label: "Purchase returns", href: "/returns?type=PURCHASE_RETURN", icon: FileClock, permission: "purchase.view" },
      { label: "Suppliers", href: "/parties?tab=suppliers", icon: Users, permission: "supplier.manage" },
      { label: "Purchase reports", href: "/reports/operations?report=purchase-orders", icon: ChartNoAxesCombined, permission: "report.purchase" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Sales dashboard", href: "/sales/dashboard", icon: ChartNoAxesCombined, permission: "sales.view" },
      { label: "Point of sale", href: "/pos", icon: ShoppingCart, permission: "SALES_INVOICE_CREATE" },
      { label: "Sales invoices", href: "/sales", icon: WalletCards, permission: "sales.view", exact: true },
      { label: "Sales returns", href: "/returns?type=SALES_RETURN", icon: FileClock, permission: "sales.view" },
      { label: "Customers", href: "/parties?tab=customers", icon: Users, permission: "customer.manage" },
      { label: "Receipts & payments", href: "/finance/payments", icon: Landmark, permission: "PAYMENT_VIEW" },
      { label: "Sales reports", href: "/reports/operations?report=sales", icon: ChartNoAxesCombined, permission: "report.sales" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance dashboard", href: "/finance", icon: ChartNoAxesCombined, permission: "FINANCE_DASHBOARD_VIEW", exact: true },
      { label: "Chart of accounts", href: "/finance/accounts", icon: BookOpenCheck, permission: "COA_VIEW" },
      { label: "Journal register", href: "/finance/journals", icon: ClipboardList, permission: "GL_VIEW" },
      { label: "Operating expenses", href: "/finance/expenses", icon: Receipt, permission: "expense.manage" },
      { label: "Party statements & aging", href: "/finance/subledgers", icon: Users, permission: ["CUSTOMER_LEDGER_VIEW", "SUPPLIER_LEDGER_VIEW"] },
      { label: "Cash in hand", href: "/finance/reports/cash-in-hand", icon: Banknote, permission: "FINANCIAL_REPORTS_VIEW" },
      { label: "Banking", href: "/finance/banking", icon: Landmark, permission: "BANK_LEDGER_VIEW" },
      { label: "Fixed assets", href: "/finance/assets", icon: Building2, permission: "ASSET_VIEW" },
      { label: "Incentives", href: "/finance/incentives", icon: BadgeDollarSign, permission: "INCENTIVE_VIEW" },
      { label: "Rebates", href: "/finance/rebates", icon: WalletCards, permission: "REBATE_VIEW" },
      { label: "Budgets", href: "/finance/budgets", icon: CalendarCheck2, permission: "BUDGET_VIEW" },
      { label: "Fiscal periods", href: "/finance/periods", icon: CalendarCheck2, permission: "PERIOD_VIEW" },
      { label: "Statements", href: "/finance/reports", icon: Scale, permission: "FINANCIAL_REPORTS_VIEW" },
      { label: "Reports & exports", href: "/reports", icon: ChartNoAxesCombined, permission: "dashboard.view" },
      { label: "Report schedules", href: "/reports/schedules", icon: CalendarCheck2, permission: "report.export" },
    ],
  },
  {
    label: "Control",
    items: [
      { label: "Approvals queue", href: "/approvals", icon: FileCheck2 },
      { label: "Users", href: "/access/users", icon: Users, permission: "access.user.view" },
      { label: "Roles & access", href: "/access/roles", icon: ShieldCheck, permission: "access.role.view" },
      { label: "Database backup & restore", href: "/settings/backup", icon: Database, permission: "backup.manage" },
      { label: "Audit trail", href: "/audit", icon: FileClock, permission: "audit.view" },
    ],
  },
];

const globalSearchIcons: Record<string, typeof Search> = {
  product: PackageSearch,
  device: Smartphone,
  "stock-transfer": ArrowLeftRight,
  "stock-adjustment": Scale,
  "stock-count": ClipboardList,
  "purchase-order": ClipboardList,
  "goods-receipt": Warehouse,
  "sales-invoice": WalletCards,
  customer: Users,
  supplier: Users,
};

function canNavigate(permissions: string[], required?: string | string[]) {
  if (!required) return true;
  return Array.isArray(required)
    ? required.some((permission) => permissions.includes(permission))
    : permissions.includes(required);
}

const breadcrumbLabels: Record<string, string> = {
  catalog: "Catalog",
  dashboard: "Dashboard",
  products: "Products",
  masters: "Catalog masters",
  locations: "Warehouse locations",
  inventory: "Inventory & devices",
  imei: "IMEI registry",
  transfers: "Stock transfers",
  adjustments: "Stock adjustments",
  "stock-counts": "Physical stock counts",
  purchases: "Procurement",
  "goods-receipts": "Goods receipts",
  new: "New",
  edit: "Edit",
  print: "Print",
  pos: "Point of sale",
  sales: "Sales invoices",
  returns: "Returns",
  parties: "Customers & suppliers",
  payments: "Receipts & payments",
  organization: "Organization",
  access: "Access control",
  users: "Users",
  roles: "Roles & permissions",
  audit: "Audit trail",
  production: "Production & Assembly",
  boms: "Bills of Materials",
  sequences: "Document numbering",
  finance: "Finance",
  accounts: "Chart of accounts",
  journals: "Journal register",
  subledgers: "Party statements & aging",
  banking: "Banking",
  assets: "Fixed assets",
  incentives: "Incentives",
  rebates: "Rebates",
  budgets: "Budgets",
  periods: "Fiscal periods",
  approvals: "Approvals queue",
  expenses: "Operating expenses",
  reports: "Reports & exports",
  operations: "Operational reports",
  "cash-in-hand": "Cash in hand",
  "operating-mode": "System operating mode",
  "trial-balance": "Trial balance",
};

export function ErpShell({ context, branches, notifications, children }: { context: Context; branches: Branch[]; notifications: Notification[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recordSearchGroups, setRecordSearchGroups] = useState<GlobalSearchGroup[]>([]);
  const [recordSearchLoading, setRecordSearchLoading] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [localNotifications, setLocalNotifications] = useState(notifications);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("axon-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    function listener(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setLocationOpen(false);
        setNotificationOpen(false);
        setUserOpen(false);
        setQuickOpen(false);
      }
    }
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (!searchOpen || query.length < 2) {
      setRecordSearchGroups([]);
      setRecordSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setRecordSearchLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Search could not be completed.");
        setRecordSearchGroups(body.data || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRecordSearchGroups([]);
          toast.error(error instanceof Error ? error.message : "Search could not be completed.");
        }
      } finally {
        if (!controller.signal.aborted) setRecordSearchLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [search, searchOpen]);

  const availableNavigation = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.filter((item) => canNavigate(context.permissions, item.permission)),
      ),
    [context.permissions],
  );
  const searchResults = availableNavigation.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()));
  const activeBranch = branches.find((branch) => branch.id === context.activeBranchId) || branches[0];
  const allWarehouses = branches.flatMap((branch) => branch.warehouses.map((warehouse) => ({ ...warehouse, branchId: branch.id, branchName: branch.name })));
  const activeWarehouse = allWarehouses.find((warehouse) => warehouse.id === context.activeWarehouseId);
  const unread = localNotifications.filter((item) => !item.readAt).length;

  function toggleCollapsed() {
    setCollapsed((value) => {
      window.localStorage.setItem("axon-sidebar-collapsed", String(!value));
      return !value;
    });
  }

  async function switchContext(branchId: string, warehouseId: string | null) {
    setSwitching(true);
    const response = await fetch("/api/context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, warehouseId }),
    });
    setSwitching(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.error?.message || "Location could not be changed.");
      return;
    }
    setLocationOpen(false);
    toast.success("Workspace location updated");
    router.refresh();
  }

  async function markNotificationsRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setLocalNotifications((items) => items.map((item) => ({ ...item, readAt: new Date().toISOString() })));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <aside className={cn("flex h-full flex-col bg-[#0b1f44] text-white transition-[width] duration-200", collapsed ? "w-[76px]" : "w-[244px]")}>
      <div className={cn("flex h-[72px] items-center border-b border-white/[.08]", collapsed ? "justify-center px-3" : "justify-between px-5")}>
        <Logo compact={collapsed} />
        {!collapsed ? <button onClick={toggleCollapsed} className="hidden rounded-lg p-1.5 text-forest-200/60 hover:bg-white/10 hover:text-white lg:block" aria-label="Collapse sidebar"><ChevronLeft className="h-4 w-4" /></button> : null}
      </div>
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => canNavigate(context.permissions, item.permission));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-6">
              {!collapsed ? <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[.18em] text-forest-200/35">{group.label}</p> : <div className="mx-auto mb-3 h-px w-7 bg-white/10" />}
              <div className="space-y-1">
                {items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={cn("group flex h-10 items-center rounded-lg text-[13px] font-medium transition", collapsed ? "justify-center px-2" : "gap-3 px-3", active ? "bg-forest-500 text-white shadow-[0_6px_18px_rgba(0,0,0,.12)]" : "text-forest-100/66 hover:bg-white/[.07] hover:text-white")}>
                      <item.icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-white" : "text-forest-300/75 group-hover:text-forest-200")} />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className={cn("border-t border-white/[.08] p-3", collapsed && "flex justify-center")}>
        <button onClick={() => setUserOpen((value) => !value)} className={cn("flex w-full items-center rounded-xl text-left hover:bg-white/[.06]", collapsed ? "justify-center p-1" : "gap-3 p-2")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-forest-200 text-[11px] font-bold text-forest-900">{initials(context.user.fullName)}</span>
          {!collapsed ? <><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{context.user.fullName}</span><span className="mt-0.5 block truncate text-[10px] text-forest-200/50">{context.roles[0]?.name || "User"}</span></span><ChevronRight className="h-4 w-4 text-forest-200/40" /></> : null}
        </button>
      </div>
    </aside>
  );

  const crumbs = pathname === "/" ? ["Overview"] : pathname.split("/").filter(Boolean).map((part) => breadcrumbLabels[part] || part);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="no-print fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
          <button onClick={() => setMobileOpen(false)} className="absolute left-[254px] top-4 rounded-full bg-white p-2 text-slate-700 shadow"><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      <div className={cn("erp-content-shell transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-[244px]")}>
        <header className="no-print sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
            {collapsed ? <button onClick={toggleCollapsed} className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:block"><ChevronRight className="h-4 w-4" /></button> : null}
            <div className="hidden items-center gap-2 text-xs sm:flex">
              <span className="text-slate-400">{context.company.code}</span>
              {crumbs.map((crumb, index) => <span className="flex items-center gap-2" key={`${crumb}-${index}`}><ChevronRight className="h-3 w-3 text-slate-300" /><span className={cn(index === crumbs.length - 1 ? "font-semibold text-slate-700" : "text-slate-400")}>{crumb}</span></span>)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button onClick={() => setSearchOpen(true)} className="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-xs text-slate-400 transition hover:border-slate-300 hover:bg-white md:flex">
              <Search className="h-3.5 w-3.5" /><span className="flex-1">Search workspace</span><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-400">⌘ K</kbd>
            </button>
            <button onClick={() => setSearchOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"><Search className="h-4 w-4" /></button>

            <div className="relative hidden sm:block">
              <button onClick={() => { setLocationOpen((value) => !value); setNotificationOpen(false); }} className="flex h-9 max-w-[210px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left hover:bg-slate-50">
                <Warehouse className="h-4 w-4 shrink-0 text-forest-700" />
                <span className="min-w-0"><span className="block truncate text-[10px] leading-3 text-slate-400">{activeBranch?.code || "All branches"}</span><span className="block truncate text-xs font-semibold text-slate-700">{activeWarehouse?.name || activeBranch?.name || "Select location"}</span></span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
              {locationOpen ? (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-float">
                  <div className="border-b border-slate-100 px-4 py-3"><p className="text-xs font-bold text-slate-900">Operating location</p><p className="mt-0.5 text-[11px] text-slate-400">Changes filters and document defaults.</p></div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {branches.map((branch) => (
                      <div key={branch.id} className="mb-2 last:mb-0">
                        <button disabled={switching} onClick={() => switchContext(branch.id, null)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50"><span><span className="block text-xs font-bold text-slate-800">{branch.name}</span><span className="text-[10px] text-slate-400">{branch.code} · all warehouses</span></span>{context.activeBranchId === branch.id && !context.activeWarehouseId ? <Check className="h-4 w-4 text-forest-600" /> : null}</button>
                        <div className="ml-3 border-l border-slate-100 pl-2">
                          {branch.warehouses.map((warehouse) => (
                            <button key={warehouse.id} disabled={switching} onClick={() => switchContext(branch.id, warehouse.id)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50"><span className="text-xs text-slate-600">{warehouse.name}</span>{context.activeWarehouseId === warehouse.id ? <Check className="h-4 w-4 text-forest-600" /> : null}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button onClick={() => { setNotificationOpen((value) => !value); setLocationOpen(false); }} className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-[18px] w-[18px]" />{unread ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amberx ring-2 ring-white" /> : null}</button>
              {notificationOpen ? (
                <div className="absolute right-0 mt-2 w-[340px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-float">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-bold text-slate-900">Notifications</p><p className="mt-0.5 text-[10px] text-slate-400">{unread} unread</p></div>{unread ? <button onClick={markNotificationsRead} className="text-[11px] font-semibold text-forest-700 hover:underline">Mark all read</button> : null}</div>
                  <div className="max-h-80 overflow-y-auto">
                    {localNotifications.length ? localNotifications.map((item) => (
                      <Link key={item.id} href={item.actionUrl || "#"} onClick={() => setNotificationOpen(false)} className="flex gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50"><span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", item.readAt ? "bg-slate-200" : item.severity === "SUCCESS" ? "bg-emerald-500" : item.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-500")} /><span><span className="block text-xs font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.message}</span><span className="mt-1.5 block text-[9px] uppercase tracking-wide text-slate-400">{formatDate(item.createdAt, true)}</span></span></Link>
                    )) : <div className="px-4 py-10 text-center text-xs text-slate-400">No notifications</div>}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative hidden sm:block">
              <button onClick={() => setQuickOpen((value) => !value)} className="flex h-9 items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white hover:bg-forest-800"><Plus className="h-4 w-4" />Create<ChevronDown className="h-3 w-3 opacity-70" /></button>
              {quickOpen ? (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-float">
                  {context.permissions.includes("PURCHASE_ORDER_CREATE") ? <Link href="/purchases/new" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><ClipboardList className="h-4 w-4 text-blue-700" />New purchase order</Link> : null}
                  {context.permissions.includes("PURCHASE_RECEIPT_CREATE") ? <Link href="/goods-receipts/new" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Warehouse className="h-4 w-4 text-blue-700" />New goods receipt</Link> : null}
                  {context.permissions.includes("SALES_INVOICE_CREATE") ? <Link href="/pos" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><ShoppingCart className="h-4 w-4 text-blue-700" />Open point of sale</Link> : null}
                  {context.permissions.includes("JOURNAL_CREATE") ? <Link href="/finance/journals" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><ClipboardList className="h-4 w-4 text-forest-700" />Journal register</Link> : null}
                  {context.permissions.includes("catalog.product.create") ? <Link href="/catalog/products?new=1" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Boxes className="h-4 w-4 text-forest-700" />New product</Link> : null}
                  {context.permissions.includes("organization.branch.create") ? <Link href="/organization?new=branch" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Building2 className="h-4 w-4 text-forest-700" />New branch</Link> : null}
                  {context.permissions.includes("access.user.create") ? <Link href="/access/users?new=1" onClick={() => setQuickOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 text-forest-700" />New user</Link> : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="erp-main min-h-[calc(100vh-72px)] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {userOpen ? (
        <div className={cn("fixed bottom-20 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-float", collapsed ? "left-3 lg:left-[84px]" : "left-3 lg:left-[16px]")}>
          <div className="px-3 py-2"><p className="truncate text-xs font-bold text-slate-900">{context.user.fullName}</p><p className="mt-1 truncate text-[10px] text-slate-400">{context.user.email}</p></div>
          <div className="my-1 h-px bg-slate-100" />
          <Link href="/organization" onClick={() => setUserOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Settings2 className="h-4 w-4" />Company settings</Link>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/35 px-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-float animate-slide-up">
            <div className="flex h-14 items-center gap-3 border-b border-slate-100 px-4"><Search className="h-5 w-5 text-slate-400" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IMEI, barcode, SKU, product, document, customer or supplier…" className="h-full flex-1 border-0 p-0 text-sm focus:ring-0" /><button onClick={() => { setSearchOpen(false); setSearch(""); setRecordSearchGroups([]); }} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-400">ESC</button></div>
            <div className="max-h-[68vh] overflow-y-auto p-2">
              {searchResults.length ? <><p className="px-3 py-2 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">Pages available in your role</p>{searchResults.slice(0, search.trim() ? 6 : 20).map((item) => <Link key={item.href} href={item.href} onClick={() => { setSearchOpen(false); setSearch(""); setRecordSearchGroups([]); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><item.icon className="h-4 w-4" /></span><span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span><Command className="h-3.5 w-3.5 text-slate-300" /></Link>)}</> : null}
              {recordSearchLoading ? <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/>Searching permitted business records…</div> : null}
              {!recordSearchLoading && recordSearchGroups.map((group) => <section key={group.type} className="mt-1 border-t border-slate-100 pt-1"><p className="px-3 py-2 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{group.label}</p>{group.items.map((item) => { const Icon = globalSearchIcons[item.type] || Search; return <Link key={`${item.type}-${item.id}`} href={item.href} onClick={() => { setSearchOpen(false); setSearch(""); setRecordSearchGroups([]); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-blue-50/60"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{item.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{item.subtitle}</span></span>{item.badge ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{item.badge.replaceAll("_", " ")}</span> : null}<ChevronRight className="h-4 w-4 text-blue-600"/></Link>; })}</section>)}
              {!recordSearchLoading && search.trim().length >= 2 && !searchResults.length && !recordSearchGroups.length ? <div className="px-3 py-12 text-center"><Search className="mx-auto h-7 w-7 text-slate-300"/><p className="mt-3 text-sm font-bold text-slate-600">No permitted records match “{search}”</p><p className="mt-1 text-xs text-slate-400">Try an IMEI, SKU, barcode, document number, customer, or supplier.</p></div> : null}
              {search.trim().length < 2 ? <p className="border-t px-3 py-4 text-center text-xs text-slate-400">Type at least two characters to search live business records. Press Ctrl/Cmd + K from anywhere.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
