"use client";

import { useMemo, useState } from "react";
import { Boxes, Package, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate, useProducts } from "@/lib/api";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { money } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout";
import { Button, IconButton } from "@/components/ui/button";
import { NativeSelect, SearchInput } from "@/components/ui/fields";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ProductDialog } from "@/components/products/product-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const { me } = useWorkspace();
  const { data: products, isLoading, mutate: refresh } = useProducts();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categories = useMemo(
    () => [...new Set((products ?? []).map((product) => product.category).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      if (category && product.category !== category) return false;
      if (!term) return true;
      return product.name.toLowerCase().includes(term) || product.sku?.toLowerCase().includes(term) || product.category?.toLowerCase().includes(term);
    });
  }, [products, search, category]);

  const active = (products ?? []).filter((product) => product.isActive);
  const catalogValue = active.reduce((acc, product) => acc + product.unitPrice, 0);

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      width: "32%",
      render: (product) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-faint"><Package className="size-3.5" /></span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium text-foreground">{product.name}</div>
            <div className="truncate text-[10.5px] text-muted">{product.sku ?? "No SKU"}{product.category ? ` · ${product.category}` : ""}</div>
          </div>
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      width: "28%",
      render: (product) => <span className="block truncate text-[11.5px] text-muted">{product.description ?? "—"}</span>,
    },
    { key: "price", header: "Unit price", align: "right", width: "110px", render: (product) => <span className="font-medium tabular-nums">{money(product.unitPrice, product.currency, { decimals: true })}</span> },
    { key: "tax", header: "Tax", align: "right", width: "80px", render: (product) => <span className="tabular-nums text-muted">{product.taxRate}%</span> },
    {
      key: "status",
      header: "Status",
      width: "95px",
      render: (product) => <Badge tone={product.isActive ? "success" : "neutral"} dot>{product.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      align: "right",
      render: (product) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton size="icon-sm" variant="ghost" aria-label="Edit product" onClick={(event) => { event.stopPropagation(); setEditing(product); setDialogOpen(true); }}>
            <Pencil className="size-3.5" />
          </IconButton>
          <IconButton size="icon-sm" variant="ghost" aria-label="Delete product" onClick={(event) => { event.stopPropagation(); setDeleteTarget(product); }}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ),
    },
  ];

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mutate(`/products/${deleteTarget.id}`, "DELETE");
      await refresh();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/quotes"));
      toast.success("Product deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete product");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      await mutate(`/products/${product.id}`, "PUT", {
        name: product.name,
        sku: product.sku,
        description: product.description,
        unitPrice: product.unitPrice,
        currency: product.currency,
        taxRate: product.taxRate,
        category: product.category,
        isActive: !product.isActive,
      });
      await refresh();
      toast.success(product.isActive ? "Product deactivated" : "Product activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update product");
    }
  }

  return (
    <div className="animate-in-fade">
      <PageHeader
        title="Products"
        subtitle={products ? `${products.length} products · ${active.length} active · ${categories.length} categories` : "Your catalog of products and services"}
        actions={
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-3.5" /> New product
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { label: "Products", value: (products ?? []).length, detail: "In catalog", icon: <Package className="size-3.5" /> },
          { label: "Active", value: active.length, detail: "Available on quotes", icon: <Power className="size-3.5" /> },
          { label: "Categories", value: categories.length, detail: categories.slice(0, 2).join(", ") || "Uncategorized", icon: <Boxes className="size-3.5" /> },
          { label: "Avg. list price", value: active.length ? money(catalogValue / active.length, me.organization.currency, { compact: true }) : "—", detail: "Across active products", icon: <Package className="size-3.5" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{item.label}</span>
              <span className="text-faint">{item.icon}</span>
            </div>
            <div className="mt-1.5 truncate text-[19px] font-semibold leading-none tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products, SKUs…" className="w-full sm:w-[240px]" />
        <NativeSelect value={category} onChange={(event) => setCategory(event.target.value)} className="h-8 w-auto min-w-[150px] text-[12px]">
          <option value="">All categories</option>
          {categories.map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
        <Badge tone="outline" className="ml-auto">{filtered.length} shown</Badge>
      </div>

      <div className="mt-2.5">
        {isLoading ? (
          <Skeleton className="h-[320px] rounded-xl" />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            loading={isLoading}
            emptyTitle="No products found"
            emptyDescription="Add the products and services you sell so they can be added to quotes in one click."
            emptyAction={<Button variant="primary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-3.5" /> New product</Button>}
            onRowClick={(product) => { setEditing(product); setDialogOpen(true); }}
          />
        )}
      </div>

      {!isLoading && (products ?? []).length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<Package />}
            title="Build your product catalog"
            description="Quotes pull pricing, tax and descriptions straight from your catalog."
            action={<Button variant="primary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-3.5" /> Add your first product</Button>}
          />
        </div>
      ) : null}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        categories={categories}
        onSaved={() => void refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete product?"}
        description="Existing quote lines keep their description and price; the product is removed from the catalog."
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
