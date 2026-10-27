import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";
import { ApiError, api } from "@/api/client";
import { CatalogDiscountManager } from "@/components/CatalogDiscountManager";
import { CatalogDiscountPrice } from "@/components/CatalogDiscountPrice";
import { ImageUpload } from "@/components/ImageUpload";
import { Header } from "@/components/PageHeader";
import { ProductAvailabilityEditor } from "@/components/ProductAvailabilityEditor";
import { QueryError } from "@/components/QueryError";
import { StoredImage } from "@/components/StoredImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useCatalogClock } from "@/lib/catalog-discounts";
import {
  type AvailabilitySchedule,
  alwaysAvailable,
  availabilityInfo,
  availabilityScheduleSchema,
  scheduleSummary,
} from "@/lib/product-availability";
import type { CatalogProduct } from "@/types/domain";

type VariantDraft = {
  variantId?: string;
  name: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  quantity: string;
  isAvailable: boolean;
};

type ProductDraft = {
  availabilitySchedule: AvailabilitySchedule;
  name: string;
  description: string;
  category: string;
  productType: CatalogProduct["productType"];
  mediaUrls: string;
  basePrice: string;
  quantity: string;
  variants: VariantDraft[];
  isFeatured: boolean;
  isOrderable: boolean;
  isActive: boolean;
};
type CatalogProductsData = { items: CatalogProduct[]; serverTime: string; timezone?: string };

const emptyDraft = (timezone = "Asia/Manila"): ProductDraft => ({
  availabilitySchedule: alwaysAvailable(timezone),
  name: "",
  description: "",
  category: "",
  productType: "OTHER",
  mediaUrls: "",
  basePrice: "",
  quantity: "",
  variants: [],
  isFeatured: false,
  isOrderable: true,
  isActive: true,
});

function draftFromProduct(product: CatalogProduct): ProductDraft {
  return {
    availabilitySchedule: product.availabilitySchedule ?? alwaysAvailable(),
    name: product.name,
    description: product.description ?? "",
    category: product.category ?? "",
    productType: product.productType,
    mediaUrls: (product.mediaUrls ?? []).join("\n"),
    basePrice: String(product.basePrice ?? ""),
    quantity: product.availableQuantity === null ? "" : String(product.availableQuantity),
    variants: product.variants.map((variant) => ({
      variantId: variant.variantId,
      name: variant.name,
      sku: variant.sku ?? "",
      size: variant.attributes.find((attribute) => attribute.name === "Size")?.value ?? "",
      color: variant.attributes.find((attribute) => attribute.name === "Color")?.value ?? "",
      price: String(variant.price),
      quantity: variant.availableQuantity === null ? "" : String(variant.availableQuantity),
      isAvailable: variant.isAvailable,
    })),
    isFeatured: product.isFeatured,
    isOrderable: product.isOrderable,
    isActive: product.isActive,
  };
}

const textAreaClass =
  "min-h-24 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10";

const alphabetical = (left: string, right: string) =>
  left.trim().localeCompare(right.trim(), undefined, { sensitivity: "base" });
const describeAvailability = (rule: AvailabilitySchedule) =>
  rule.mode === "CUSTOM_DATES" ? [...rule.dates].sort().join(", ") : scheduleSummary(rule);

export function CatalogPage() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<CatalogProduct>();
  const [draft, setDraft] = useState<ProductDraft>(() => emptyDraft());
  const [open, setOpen] = useState(false);
  const [productScheduleAttempts, setProductScheduleAttempts] = useState(0);
  const [archiving, setArchiving] = useState<CatalogProduct>();
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [availabilityProduct, setAvailabilityProduct] = useState<CatalogProduct>();
  const [availabilityRule, setAvailabilityRule] = useState<AvailabilitySchedule>(alwaysAvailable);
  const [availabilityActive, setAvailabilityActive] = useState(true);
  const [availabilityAttempts, setAvailabilityAttempts] = useState(0);
  const [availabilityConflict, setAvailabilityConflict] = useState(false);
  const [availabilityEditorVersion, setAvailabilityEditorVersion] = useState(0);
  const availabilityFeedback = useRef<HTMLParagraphElement>(null);
  const products = useQuery({
    queryKey: ["catalog-products"],
    queryFn: () => api<CatalogProductsData>("/catalog/products"),
    refetchInterval: 30_000,
  });
  const now = useCatalogClock(products.data?.serverTime, products.dataUpdatedAt);
  const items = products.data?.items ?? [];
  const selectedIds = selected.filter((id) =>
    items.some((product) => product._id === id && product.isActive),
  );
  function selectProducts(list: CatalogProduct[], checked: boolean) {
    const ids = list.filter((product) => product.isActive).map((product) => product._id);
    setSelected((current) =>
      checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
    );
  }
  const categories = new Map<string, string>();
  for (const product of items) {
    const label = product.category?.trim();
    if (label && !categories.has(label.toLowerCase())) {
      categories.set(label.toLowerCase(), label);
    }
  }
  const selectedCategory = categories.has(categoryFilter) ? categoryFilter : "";
  const categoryProducts = selectedCategory
    ? items.filter((product) => product.category?.trim().toLowerCase() === selectedCategory)
    : items;
  const categoryQuery = categorySearch.trim().toLowerCase();
  const filteredProducts = categoryProducts.filter(
    (product) =>
      (product.category?.trim() || "Uncategorized").toLowerCase().includes(categoryQuery) &&
      (!statusFilter ||
        availabilityInfo(product, new Date(now)).availabilityStatus === statusFilter),
  );
  const hasFilters = Boolean(categorySearch || selectedCategory || statusFilter);
  function clearFilters() {
    setCategorySearch("");
    setCategoryFilter("");
    setStatusFilter("");
  }
  const groups = new Map<string, { label: string; products: CatalogProduct[] }>();
  for (const product of filteredProducts) {
    const key = product.category?.trim().toLowerCase() ?? "";
    let group = groups.get(key);
    if (!group) {
      group = { label: categories.get(key) ?? "Uncategorized", products: [] };
      groups.set(key, group);
    }
    group.products.push(product);
  }
  const sections = [...groups.entries()].sort(([, left], [, right]) =>
    alphabetical(left.label, right.label),
  );
  for (const [, group] of sections) {
    group.products.sort((left, right) => alphabetical(left.name, right.name));
  }
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["catalog-products"] });
    void client.invalidateQueries({ queryKey: ["landing-categories"] });
    void client.invalidateQueries({ queryKey: ["landing-page-builder"] });
    void client.invalidateQueries({ queryKey: ["catalog-discounts"] });
    void client.invalidateQueries({ queryKey: ["public-landing-page"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const validated = v.safeParse(availabilityScheduleSchema, draft.availabilitySchedule);
      if (!validated.success) throw new Error("Complete the availability schedule before saving.");
      const payload = {
        ...(editing ? { expectedRevision: editing.revision ?? 1 } : {}),
        availabilitySchedule: validated.output,
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        productType: draft.productType,
        mediaUrls: draft.mediaUrls
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        basePrice: Number(draft.basePrice),
        availableQuantity: draft.quantity === "" ? null : Number(draft.quantity),
        variants: draft.variants.map((variant) => ({
          ...(variant.variantId ? { variantId: variant.variantId } : {}),
          name: variant.name.trim(),
          sku: variant.sku.trim(),
          attributes: [
            ...(variant.size.trim() ? [{ name: "Size", value: variant.size.trim() }] : []),
            ...(variant.color.trim() ? [{ name: "Color", value: variant.color.trim() }] : []),
          ],
          price: Number(variant.price),
          availableQuantity: variant.quantity === "" ? null : Number(variant.quantity),
          isAvailable: variant.isAvailable,
        })),
        isFeatured: draft.isFeatured,
        isOrderable: draft.isOrderable,
        isActive: draft.isActive,
      };
      return api(editing ? `/catalog/products/${editing._id}` : "/catalog/products", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEditing(undefined);
      toast.success(editing ? "Product updated" : "Product added to the catalog");
    },
    onError: (error) => toast.error(error.message),
  });
  const archive = useMutation({
    mutationFn: (product: CatalogProduct) =>
      api(`/catalog/products/${product._id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      setArchiving(undefined);
      toast.success("Product archived");
    },
    onError: (error) => toast.error(error.message),
  });

  const saveAvailability = useMutation({
    mutationFn: () => {
      if (!availabilityProduct) throw new Error("Select a product");
      const validated = v.safeParse(availabilityScheduleSchema, availabilityRule);
      if (!validated.success) throw new Error("Complete the availability schedule before saving.");
      return api(`/catalog/products/${availabilityProduct._id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: availabilityActive,
          availabilitySchedule: validated.output,
          expectedRevision: availabilityProduct.revision ?? 1,
        }),
      });
    },
    onSuccess: () => {
      refresh();
      setAvailabilityProduct(undefined);
      toast.success("Product availability saved");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "PRODUCT_REVISION_CONFLICT") {
        setAvailabilityConflict(true);
        reviewAvailability.reset();
      }
    },
  });
  const reviewAvailability = useMutation({
    mutationFn: async () => {
      const data = await api<CatalogProductsData>("/catalog/products");
      const latest = data.items.find((product) => product._id === availabilityProduct?._id);
      if (!latest)
        throw new Error(
          "This product is no longer available. Close this dialog and refresh the catalog.",
        );
      client.setQueryData(["catalog-products"], data);
      return latest;
    },
  });
  useEffect(() => {
    if (saveAvailability.error) availabilityFeedback.current?.focus();
  }, [saveAvailability.error]);
  function resolveAvailabilityConflict(useLatest: boolean) {
    const latest = reviewAvailability.data;
    if (!latest) return;
    setAvailabilityProduct(latest);
    if (useLatest) {
      setAvailabilityRule(latest.availabilitySchedule ?? alwaysAvailable(products.data?.timezone));
      setAvailabilityActive(latest.isActive);
      setAvailabilityAttempts(0);
      setAvailabilityEditorVersion((version) => version + 1);
    }
    setAvailabilityConflict(false);
    saveAvailability.reset();
    reviewAvailability.reset();
  }
  function startCreate() {
    save.reset();
    setProductScheduleAttempts(0);
    setEditing(undefined);
    setDraft(emptyDraft(products.data?.timezone));
    setOpen(true);
  }
  function startEdit(product: CatalogProduct) {
    save.reset();
    setProductScheduleAttempts(0);
    setEditing(product);
    setDraft(draftFromProduct(product));
    setOpen(true);
  }
  function updateVariant(index: number, changes: Partial<VariantDraft>) {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...changes } : variant,
      ),
    }));
  }

  if (products.isLoading) return <PageSkeleton cards={6} />;
  if (products.isError)
    return <QueryError message={products.error.message} retry={() => void products.refetch()} />;

  return (
    <div className="space-y-6">
      <Header
        title="Product Catalog"
        description="Create clothing, farm products, merchandise, and other items that can be featured and ordered from your landing page. Food remains managed in Menu."
      >
        <Button permission={{ path: "/catalog/products", method: "POST" }} onClick={startCreate}>
          <Icon icon="solar:add-circle-linear" /> Add product
        </Button>
      </Header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-pink-100 bg-white p-4">
        <p className="text-sm font-semibold">{selectedIds.length} selected</p>
        <Button
          variant="outline"
          size="sm"
          disabled={!filteredProducts.some((product) => product.isActive)}
          onClick={() => selectProducts(filteredProducts, true)}
        >
          Select all filtered products
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!selectedIds.length}
          onClick={() => setSelected([])}
        >
          Clear selection
        </Button>
        <CatalogDiscountManager
          products={items}
          selectedIds={selectedIds}
          now={now}
          onSaved={refresh}
        />
      </div>

      <search aria-label="Product catalog filters" className="space-y-3">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-2">
            <label htmlFor="catalog-category-search" className="text-sm font-medium">
              Search by category
            </label>
            <Input
              id="catalog-category-search"
              type="search"
              placeholder="e.g. Clothing, farm products"
              value={categorySearch}
              onChange={(event) => setCategorySearch(event.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="catalog-category-filter" className="text-sm font-medium">
              Category
            </label>
            <select
              id="catalog-category-filter"
              value={selectedCategory}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10"
            >
              <option value="">All categories</option>
              {[...categories.entries()]
                .sort(([, left], [, right]) => alphabetical(left, right))
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <label className="block min-w-0 text-sm font-medium">
            Availability status
            <select
              aria-label="Availability status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-pink-100 bg-white px-3"
            >
              <option value="">All statuses</option>
              {["INACTIVE", "ALWAYS", "ACTIVE_NOW", "SCHEDULED", "EXPIRED"].map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!hasFilters}
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        </div>
        <p role="status" className="text-sm text-stone-500">
          Showing {filteredProducts.length} of {items.length} products
        </p>
      </search>

      {items.length > 0 && filteredProducts.length === 0 ? (
        <Card className="p-10 text-center">
          <h2 className="font-display text-xl font-semibold">No matching products</h2>
          <p className="mt-2 text-sm text-stone-500">
            Try another category search or clear the filters to see all products.
          </p>
          <Button variant="outline" className="mt-5" onClick={clearFilters}>
            Show all products
          </Button>
        </Card>
      ) : items.length ? (
        <div className="space-y-8">
          {sections.map(([key, group]) => (
            <section key={key} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">
                  {group.label}{" "}
                  <span className="text-lg font-medium text-stone-500">
                    ({group.products.length})
                  </span>
                </h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Select category ${group.label}`}
                    disabled={!group.products.some((product) => product.isActive)}
                    checked={
                      group.products.some((product) => product.isActive) &&
                      group.products
                        .filter((product) => product.isActive)
                        .every((product) => selectedIds.includes(product._id))
                    }
                    onChange={(event) => selectProducts(group.products, event.target.checked)}
                  />
                  Select category
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.products.map((product) => (
                  <Card key={product._id} className={!product.isActive ? "opacity-60" : ""}>
                    {product.mediaUrls?.[0] && (
                      <StoredImage
                        src={product.mediaUrls[0]}
                        alt={product.name}
                        className="h-44 w-full rounded-t-2xl object-cover"
                      />
                    )}
                    <CardContent className="space-y-4 p-5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          aria-label={`Select ${product.name}`}
                          checked={selectedIds.includes(product._id)}
                          disabled={!product.isActive}
                          onChange={(event) => selectProducts([product], event.target.checked)}
                        />
                        Select product
                      </label>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-pink-700">
                            {product.category || product.productType.replaceAll("_", " ")}
                          </p>
                          <h3 className="mt-1 font-display text-xl font-semibold">
                            {product.name}
                          </h3>
                        </div>
                        <Badge tone={product.isActive && product.isOrderable ? "green" : "neutral"}>
                          {product.isActive
                            ? product.isOrderable
                              ? "Orderable"
                              : "Hidden"
                            : "Archived"}
                        </Badge>
                      </div>
                      <p className="text-sm text-stone-600">
                        {availabilityInfo(product, new Date(now)).availabilityStatus.replaceAll(
                          "_",
                          " ",
                        )}{" "}
                        · {product.scheduleSummary ?? "Always active"}
                        {product.nextActiveAt
                          ? ` · Next active ${new Date(product.nextActiveAt).toLocaleString()}`
                          : ""}
                      </p>
                      <p className="line-clamp-2 text-sm text-stone-500">
                        {product.description || "No product description yet."}
                      </p>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-lg text-pink-700">
                            <CatalogDiscountPrice
                              now={now}
                              from={product.variants.length > 0}
                              pricing={
                                product.variants.length
                                  ? {
                                      ...[...product.variants].sort(
                                        (left, right) => Number(left.price) - Number(right.price),
                                      )[0],
                                      discount: product.discount,
                                    }
                                  : { ...product, price: product.basePrice }
                              }
                            />
                          </div>
                          <p className="text-xs text-stone-500">
                            {product.variants.length
                              ? `${product.variants.length} option${product.variants.length === 1 ? "" : "s"}`
                              : product.availableQuantity === null
                                ? "Quantity not tracked"
                                : `${product.availableQuantity} available`}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            permission={{
                              path: "/catalog/products/id/availability",
                              method: "PATCH",
                            }}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              saveAvailability.reset();
                              reviewAvailability.reset();
                              setAvailabilityAttempts(0);
                              setAvailabilityConflict(false);
                              setAvailabilityEditorVersion((version) => version + 1);
                              setAvailabilityProduct(product);
                              setAvailabilityRule(
                                product.availabilitySchedule ??
                                  alwaysAvailable(products.data?.timezone),
                              );
                              setAvailabilityActive(product.isActive);
                            }}
                          >
                            Schedule availability
                          </Button>
                          <Button
                            permission={{ path: "/catalog/products", method: "PUT" }}
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(product)}
                          >
                            Edit
                          </Button>
                          {product.isActive && (
                            <Button
                              permission={{ path: "/catalog/products", method: "DELETE" }}
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchiving(product)}
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <Icon icon="solar:box-minimalistic-linear" className="mx-auto size-12 text-pink-400" />
          <h2 className="mt-4 font-display text-xl font-semibold">No general products yet</h2>
          <p className="mt-2 text-sm text-stone-500">
            Add clothing or merchandise here, then feature it through the landing-page builder.
          </p>
          <Button
            permission={{ path: "/catalog/products", method: "POST" }}
            className="mt-5"
            onClick={startCreate}
          >
            Add your first product
          </Button>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            Leave quantity empty for products that do not need stock tracking.
          </DialogDescription>
          <form
            className="mt-5 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              setProductScheduleAttempts((attempts) => attempts + 1);
              if (!v.safeParse(availabilityScheduleSchema, draft.availabilitySchedule).success)
                return;
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name">
                <Input
                  required
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={draft.category}
                  placeholder="Shirts, farm goods, souvenirs"
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </Field>
              <Field label="Product type">
                <select
                  className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm"
                  value={draft.productType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      productType: event.target.value as CatalogProduct["productType"],
                    })
                  }
                >
                  <option value="CLOTHING">Clothing</option>
                  <option value="FARM_PRODUCT">Farm product</option>
                  <option value="MERCHANDISE">Merchandise</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Base price">
                <Input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={draft.basePrice}
                  onChange={(event) => setDraft({ ...draft, basePrice: event.target.value })}
                />
              </Field>
              <Field label="Available quantity">
                <Input
                  min="0"
                  step="1"
                  type="number"
                  value={draft.quantity}
                  placeholder="Unlimited when blank"
                  disabled={draft.variants.length > 0}
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <textarea
                  className={textAreaClass}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <ImageUpload
                  scope="catalog"
                  selection={draft.mediaUrls}
                  disabled={draft.mediaUrls.split("\n").filter(Boolean).length >= 8}
                  onReady={(url) =>
                    setDraft((current) => ({
                      ...current,
                      mediaUrls: [current.mediaUrls, url].filter(Boolean).join("\n"),
                    }))
                  }
                />
                <Label>Media links (one per line)</Label>
                <textarea
                  className={textAreaClass}
                  value={draft.mediaUrls}
                  placeholder="https://..."
                  onChange={(event) => setDraft({ ...draft, mediaUrls: event.target.value })}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-pink-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Options and variants</h3>
                  <p className="text-xs text-stone-500">
                    Use variants for clothing sizes, colors, or styles.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      quantity: "",
                      variants: [
                        ...draft.variants,
                        {
                          name: "",
                          sku: "",
                          size: "",
                          color: "",
                          price: draft.basePrice,
                          quantity: "",
                          isAvailable: true,
                        },
                      ],
                    })
                  }
                >
                  <Icon icon="solar:add-circle-linear" /> Add option
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                {draft.variants.map((variant, index) => (
                  <div
                    key={variant.variantId ?? index}
                    className="grid gap-3 rounded-xl bg-pink-50/50 p-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <Field label="Option name">
                      <Input
                        required
                        value={variant.name}
                        placeholder="Red / Medium"
                        onChange={(event) => updateVariant(index, { name: event.target.value })}
                      />
                    </Field>
                    <Field label="SKU">
                      <Input
                        value={variant.sku}
                        onChange={(event) => updateVariant(index, { sku: event.target.value })}
                      />
                    </Field>
                    <Field label="Size">
                      <Input
                        value={variant.size}
                        placeholder="M"
                        onChange={(event) => updateVariant(index, { size: event.target.value })}
                      />
                    </Field>
                    <Field label="Color">
                      <Input
                        value={variant.color}
                        placeholder="Red"
                        onChange={(event) => updateVariant(index, { color: event.target.value })}
                      />
                    </Field>
                    <Field label="Price">
                      <Input
                        required
                        min="0"
                        step="0.01"
                        type="number"
                        value={variant.price}
                        onChange={(event) => updateVariant(index, { price: event.target.value })}
                      />
                    </Field>
                    <Field label="Quantity">
                      <Input
                        min="0"
                        step="1"
                        type="number"
                        value={variant.quantity}
                        placeholder="Unlimited"
                        onChange={(event) => updateVariant(index, { quantity: event.target.value })}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end pb-3 text-sm">
                      <input
                        type="checkbox"
                        checked={variant.isAvailable}
                        onChange={(event) =>
                          updateVariant(index, { isAvailable: event.target.checked })
                        }
                      />{" "}
                      Available
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="self-end"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          variants: draft.variants.filter(
                            (_, variantIndex) => variantIndex !== index,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <ProductAvailabilityEditor
              schedule={draft.availabilitySchedule}
              isActive={draft.isActive}
              onChange={(availabilitySchedule) => setDraft({ ...draft, availabilitySchedule })}
              onActiveChange={(isActive) => setDraft({ ...draft, isActive })}
              showValidationErrors={productScheduleAttempts > 0}
              validationAttempt={productScheduleAttempts}
              now={now}
            />
            <div className="flex flex-wrap gap-4 rounded-xl bg-stone-50 p-3 text-sm">
              <Check
                label="Featured"
                checked={draft.isFeatured}
                onChange={(checked) => setDraft({ ...draft, isFeatured: checked })}
              />
              <Check
                label="Can be ordered"
                checked={draft.isOrderable}
                onChange={(checked) => setDraft({ ...draft, isOrderable: checked })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                permission={{ path: "/catalog/products", method: editing ? "PUT" : "POST" }}
                type="submit"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving..." : "Save product"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(availabilityProduct)}
        onOpenChange={(value) => {
          if (!value && !saveAvailability.isPending && !reviewAvailability.isPending)
            setAvailabilityProduct(undefined);
        }}
      >
        <DialogContent className="flex max-w-2xl flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-stone-200 px-4 py-5 sm:px-6">
            <DialogTitle className="break-words pr-10">
              Availability — {availabilityProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Set active dates without changing stock or existing orders.
            </DialogDescription>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            data-availability-scroll=""
          >
            <fieldset
              className="space-y-4"
              disabled={saveAvailability.isPending || reviewAvailability.isPending}
            >
              <ProductAvailabilityEditor
                key={availabilityEditorVersion}
                showHeading={false}
                now={now}
                schedule={availabilityRule}
                isActive={availabilityActive}
                onChange={(rule) => {
                  if (!availabilityConflict) saveAvailability.reset();
                  setAvailabilityRule(rule);
                }}
                onActiveChange={(active) => {
                  if (!availabilityConflict) saveAvailability.reset();
                  setAvailabilityActive(active);
                }}
                showValidationErrors={availabilityAttempts > 0}
                validationAttempt={availabilityAttempts}
              />
              {saveAvailability.error && (
                <p
                  ref={availabilityFeedback}
                  tabIndex={-1}
                  role="alert"
                  className="text-sm text-red-700"
                >
                  {saveAvailability.error.message}
                </p>
              )}
              {availabilityConflict && (
                <section
                  aria-label="Review availability conflict"
                  className="space-y-3 rounded-xl border border-amber-400 bg-amber-50 p-4"
                >
                  <p className="text-sm">
                    Your changes are retained. Review the latest saved availability before choosing
                    which version to use.
                  </p>
                  {reviewAvailability.error && (
                    <p role="alert" className="text-sm text-red-700">
                      {reviewAvailability.error.message}
                    </p>
                  )}
                  {!reviewAvailability.data ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => reviewAvailability.mutate()}
                    >
                      {reviewAvailability.isPending
                        ? "Loading latest version…"
                        : "Review latest version"}
                    </Button>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1 rounded-lg border border-amber-300 bg-white p-3 text-sm">
                          <h3 className="font-semibold">Latest saved availability</h3>
                          <p>
                            {reviewAvailability.data.isActive
                              ? "Product enabled"
                              : "Product disabled"}
                          </p>
                          <p className="max-h-32 overflow-auto break-words">
                            {describeAvailability(
                              reviewAvailability.data.availabilitySchedule ??
                                alwaysAvailable(products.data?.timezone),
                            )}
                          </p>
                          <p>
                            {reviewAvailability.data.availabilitySchedule?.timezone ??
                              products.data?.timezone ??
                              "Asia/Manila"}
                          </p>
                        </div>
                        <div className="space-y-1 rounded-lg border border-amber-300 bg-white p-3 text-sm">
                          <h3 className="font-semibold">Your changes</h3>
                          <p>{availabilityActive ? "Product enabled" : "Product disabled"}</p>
                          <p className="max-h-32 overflow-auto break-words">
                            {v.safeParse(availabilityScheduleSchema, availabilityRule).success
                              ? describeAvailability(availabilityRule)
                              : "Unfinished schedule"}
                          </p>
                          <p>{availabilityRule.timezone}</p>
                        </div>
                      </div>
                      <p className="text-sm">
                        Choose a version, then select Save availability to apply it.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => resolveAvailabilityConflict(false)}
                        >
                          Keep my changes
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => resolveAvailabilityConflict(true)}
                        >
                          Use latest availability
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
            </fieldset>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 bg-white px-4 py-4 sm:px-6">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={saveAvailability.isPending || reviewAvailability.isPending}
              onClick={() => setAvailabilityProduct(undefined)}
            >
              Cancel
            </Button>
            <Button
              permission={{ path: "/catalog/products/id/availability", method: "PATCH" }}
              className="min-h-11"
              disabled={
                saveAvailability.isPending || availabilityConflict || reviewAvailability.isPending
              }
              onClick={() => {
                setAvailabilityAttempts((attempts) => attempts + 1);
                if (v.safeParse(availabilityScheduleSchema, availabilityRule).success)
                  saveAvailability.mutate();
              }}
            >
              {saveAvailability.isPending ? "Saving…" : "Save availability"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(archiving)} onOpenChange={(value) => !value && setArchiving(undefined)}>
        <DialogContent>
          <DialogTitle>Archive {archiving?.name}?</DialogTitle>
          <DialogDescription>
            The product will stop appearing publicly, but historical orders keep their product
            snapshot.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setArchiving(undefined)}>
              Keep product
            </Button>
            <Button
              permission={{ path: "/catalog/products", method: "DELETE" }}
              disabled={archive.isPending}
              onClick={() => archiving && archive.mutate(archiving)}
            >
              Archive product
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
