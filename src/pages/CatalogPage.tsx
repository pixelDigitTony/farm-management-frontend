import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatPeso } from "@/lib/utils";
import type { CatalogProduct } from "@/types/domain";
import { Header } from "./PigsPage";

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

const emptyDraft = (): ProductDraft => ({
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

export function CatalogPage() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<CatalogProduct>();
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<CatalogProduct>();
  const products = useQuery({
    queryKey: ["catalog-products"],
    queryFn: () => api<{ items: CatalogProduct[] }>("/catalog/products"),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["catalog-products"] });
    void client.invalidateQueries({ queryKey: ["landing-page-builder"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const payload = {
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

  function startCreate() {
    setEditing(undefined);
    setDraft(emptyDraft());
    setOpen(true);
  }
  function startEdit(product: CatalogProduct) {
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
        <Button onClick={startCreate}>
          <Icon icon="solar:add-circle-linear" /> Add product
        </Button>
      </Header>

      {(products.data?.items ?? []).length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.data?.items.map((product) => (
            <Card key={product._id} className={!product.isActive ? "opacity-60" : ""}>
              {product.mediaUrls?.[0] && (
                <img
                  src={product.mediaUrls[0]}
                  alt={product.name}
                  className="h-44 w-full rounded-t-2xl object-cover"
                />
              )}
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-pink-700">
                      {product.category || product.productType.replaceAll("_", " ")}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold">{product.name}</h2>
                  </div>
                  <Badge tone={product.isActive && product.isOrderable ? "green" : "neutral"}>
                    {product.isActive ? (product.isOrderable ? "Orderable" : "Hidden") : "Archived"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-stone-500">
                  {product.description || "No product description yet."}
                </p>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-pink-700">
                      {formatPeso(product.basePrice)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {product.variants.length
                        ? `${product.variants.length} option${product.variants.length === 1 ? "" : "s"}`
                        : product.availableQuantity === null
                          ? "Quantity not tracked"
                          : `${product.availableQuantity} available`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(product)}>
                      Edit
                    </Button>
                    {product.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => setArchiving(product)}>
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <Icon icon="solar:box-minimalistic-linear" className="mx-auto size-12 text-pink-400" />
          <h2 className="mt-4 font-display text-xl font-semibold">No general products yet</h2>
          <p className="mt-2 text-sm text-stone-500">
            Add clothing or merchandise here, then feature it through the landing-page builder.
          </p>
          <Button className="mt-5" onClick={startCreate}>
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
                <Label>Public media links (one HTTPS link per line)</Label>
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
              <Check
                label="Active"
                checked={draft.isActive}
                onChange={(checked) => setDraft({ ...draft, isActive: checked })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save product"}
              </Button>
            </div>
          </form>
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
