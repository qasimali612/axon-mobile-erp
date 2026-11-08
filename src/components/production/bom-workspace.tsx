"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, Layers, Plus, RefreshCw, Smartphone, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { responseError } from "@/components/ui/form-error";
import { titleCase } from "@/lib/utils";

type BomItem = {
  id: string;
  componentProductId: string;
  componentVariantId: string;
  quantity: string;
  scrapTolerance: string;
  componentProduct: { sku: string; name: string };
  componentVariant: { sku: string; name: string };
};

type Bom = {
  id: string;
  code: string;
  name: string;
  outputQuantity: string;
  scrapPercentage: string;
  description: string | null;
  isActive: boolean;
  product: { id: string; sku: string; name: string; model: string | null };
  variant: { id: string; sku: string; name: string; color: string | null };
  items: BomItem[];
  _count?: { productionOrders: number };
};

export function BomWorkspace({ permissions }: { permissions: string[] }) {
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lookups
  const [phoneProducts, setPhoneProducts] = useState<any[]>([]);
  const [componentProducts, setComponentProducts] = useState<any[]>([]);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [scrapPercentage, setScrapPercentage] = useState("0");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<
    Array<{
      componentProductId: string;
      componentVariantId: string;
      quantity: string;
      scrapTolerance: string;
    }>
  >([]);

  const canManage = permissions.includes("production.bom.manage");

  async function load() {
    setLoading(true);
    const [bomRes, prodRes] = await Promise.all([
      fetch("/api/production/boms"),
      fetch("/api/products?pageSize=200&status=ACTIVE"),
    ]);

    setLoading(false);
    if (!bomRes.ok) return toast.error(await responseError(bomRes));
    const bomBody = await bomRes.json();
    setBoms(bomBody.data || []);

    if (prodRes.ok) {
      const prodBody = await prodRes.json();
      const all = prodBody.data || [];
      const phones = all.filter((p: any) => ["SMARTPHONE", "FEATURE_PHONE"].includes(p.productType));
      const components = all.filter((p: any) => !["SMARTPHONE", "FEATURE_PHONE"].includes(p.productType));
      setPhoneProducts(phones);
      setComponentProducts(components.length ? components : all);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setCode(`BOM-${Date.now().toString().slice(-6)}`);
    setName("");
    const firstPhone = phoneProducts[0];
    setSelectedProductId(firstPhone?.id || "");
    setSelectedVariantId(firstPhone?.variants?.[0]?.id || "");
    setOutputQuantity("1");
    setScrapPercentage("0");
    setDescription("");
    setItems([]);
    setOpen(true);
  }

  function addComponentLine() {
    const firstComp = componentProducts[0];
    setItems([
      ...items,
      {
        componentProductId: firstComp?.id || "",
        componentVariantId: firstComp?.variants?.[0]?.id || "",
        quantity: "1",
        scrapTolerance: "0",
      },
    ]);
  }

  function removeComponentLine(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function saveBom(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) {
      return toast.error("At least one CKD/SKD component material is required in a BOM.");
    }
    setSaving(true);
    const response = await fetch("/api/production/boms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        productId: selectedProductId,
        variantId: selectedVariantId,
        outputQuantity: Number(outputQuantity),
        scrapPercentage: Number(scrapPercentage),
        description,
        items: items.map((item) => ({
          componentProductId: item.componentProductId,
          componentVariantId: item.componentVariantId,
          quantity: Number(item.quantity),
          scrapTolerance: Number(item.scrapTolerance),
        })),
      }),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    toast.success("Bill of Materials created successfully.");
    setOpen(false);
    void load();
  }

  const selectedPhone = phoneProducts.find((p) => p.id === selectedProductId);

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link
              href="/production"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Production Orders
            </Link>
          </div>
          <span className="kicker">Manufacturing Engineering</span>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-[30px]">Bills of Materials (BOM)</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Define assembly recipes, CKD/SKD material consumption ratios, and scrap allowances for finished mobile phones.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New BOM
            </Button>
          ) : null}
        </div>
      </div>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">BOM Code / Name</th>
                <th className="px-4 py-3">Finished Smartphone</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">Components</th>
                <th className="px-4 py-3 text-right">Batch Output</th>
                <th className="px-4 py-3">Scrap Rate</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    Loading BOMs…
                  </td>
                </tr>
              ) : !boms.length ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    No bills of materials defined yet. Click "New BOM" to configure your first phone assembly formula.
                  </td>
                </tr>
              ) : (
                boms.map((bom) => (
                  <tr key={bom.id} className="text-xs hover:bg-slate-50/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700">
                          <Layers className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-bold text-slate-900">{bom.name}</p>
                          <p className="font-mono text-[10px] text-slate-400">{bom.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800">
                      {bom.product.name}
                      <span className="ml-1 text-[10px] text-slate-400">({bom.product.sku})</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {bom.variant.name} {bom.variant.color ? `· ${bom.variant.color}` : ""}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone="slate">{bom.items.length} parts</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                      {Number(bom.outputQuantity)} unit
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{Number(bom.scrapPercentage)}%</td>
                    <td className="px-4 py-3.5">
                      <Badge tone={bom.isActive ? "green" : "slate"}>{bom.isActive ? "Active" : "Archived"}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={saveBom} className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex justify-between border-b px-6 py-4">
              <h2 className="font-bold text-slate-900">New Bill of Materials (BOM)</h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  BOM Code
                  <input
                    required
                    className="field-input uppercase"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  BOM Name
                  <input
                    required
                    className="field-input"
                    placeholder="e.g. Note 50 8GB/256GB Assembly"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Finished Smartphone
                  <select
                    className="field-input"
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      const p = phoneProducts.find((item) => item.id === e.target.value);
                      setSelectedVariantId(p?.variants?.[0]?.id || "");
                    }}
                  >
                    {phoneProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Product Variant
                  <select
                    className="field-input"
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                  >
                    {selectedPhone?.variants?.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.color ? `· ${v.color}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Target Output (Units)
                  <input
                    required
                    type="number"
                    min="1"
                    className="field-input"
                    value={outputQuantity}
                    onChange={(e) => setOutputQuantity(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Scrap Allowance (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="field-input"
                    value={scrapPercentage}
                    onChange={(e) => setScrapPercentage(e.target.value)}
                  />
                </label>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Component Materials (CKD / SKD Parts)
                  </h3>
                  <Button type="button" size="sm" variant="outline" onClick={addComponentLine}>
                    <Plus className="h-3 w-3" />
                    Add Part
                  </Button>
                </div>

                {!items.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    No components added yet. Click "Add Part" to add displays, motherboards, batteries, housings, etc.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, idx) => {
                      const comp = componentProducts.find((p) => p.id === item.componentProductId);
                      return (
                        <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs">
                          <div className="flex-1">
                            <select
                              className="field-input text-xs"
                              value={item.componentProductId}
                              onChange={(e) => {
                                const newId = e.target.value;
                                const p = componentProducts.find((cp) => cp.id === newId);
                                const updated = [...items];
                                updated[idx].componentProductId = newId;
                                updated[idx].componentVariantId = p?.variants?.[0]?.id || "";
                                setItems(updated);
                              }}
                            >
                              {componentProducts.map((cp) => (
                                <option key={cp.id} value={cp.id}>
                                  {cp.name} ({cp.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              min="0.0001"
                              step="any"
                              placeholder="Qty"
                              title="Quantity per unit"
                              className="field-input text-xs font-mono"
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...items];
                                updated[idx].quantity = e.target.value;
                                setItems(updated);
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeComponentLine(idx)}
                            className="rounded p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Save BOM"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

