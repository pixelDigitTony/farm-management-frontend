import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import {
  type CatalogDiscount,
  discountStatus,
  fromManilaInput,
  manilaInput,
  type ProductDiscount,
  previewDiscount,
} from "@/lib/catalog-discounts";
import { formatPeso } from "@/lib/utils";
import type { CatalogProduct } from "@/types/domain";
import { DiscountCountdown } from "./CatalogDiscountPrice";
import { QueryError } from "./QueryError";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input, Label } from "./ui/input";

type Draft = {
  id?: string;
  name: string;
  type: ProductDiscount["type"];
  value: string;
  productIds: string[];
  startNow: boolean;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
};

export function CatalogDiscountManager({
  products,
  selectedIds,
  now,
  onSaved,
}: {
  products: CatalogProduct[];
  selectedIds: string[];
  now: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const discounts = useQuery({
    queryKey: ["catalog-discounts"],
    queryFn: () => api<{ items: CatalogDiscount[] }>("/catalog/discounts"),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: async (input: Draft) =>
      api(input.id ? `/catalog/discounts/${input.id}` : "/catalog/discounts", {
        method: input.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: input.name,
          type: input.type,
          value: Number(input.value),
          productIds: input.productIds,
          startsAt: input.startNow ? new Date(now).toISOString() : fromManilaInput(input.startsAt),
          endsAt: fromManilaInput(input.endsAt),
          isEnabled: input.isEnabled,
        }),
      }),
    onSuccess: () => {
      setDraft(undefined);
      setError("");
      void discounts.refetch();
      onSaved();
      toast.success("Promotion saved");
    },
    onError: (failure) => setError(failure.message),
  });
  const toggle = useMutation({
    mutationFn: (promotion: CatalogDiscount) =>
      api(`/catalog/discounts/${promotion._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !promotion.isEnabled }),
      }),
    onSuccess: () => {
      void discounts.refetch();
      onSaved();
      toast.success("Promotion status updated");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const pending = save.isPending || toggle.isPending;
  function edit(promotion: CatalogDiscount) {
    setError("");
    setSearch("");
    setDraft({
      id: promotion._id,
      name: promotion.name,
      type: promotion.type,
      value: String(promotion.value),
      productIds: promotion.productIds,
      startNow: false,
      startsAt: manilaInput(promotion.startsAt),
      endsAt: manilaInput(promotion.endsAt),
      isEnabled: promotion.isEnabled,
    });
  }
  const selected = products.filter((product) => draft?.productIds.includes(product._id));
  const conflicts = draft?.isEnabled
    ? (discounts.data?.items ?? []).filter(
        (promotion) =>
          promotion._id !== draft.id &&
          promotion.isEnabled &&
          discountStatus(promotion, now) !== "Expired" &&
          promotion.productIds.some((id) => draft.productIds.includes(id)),
      )
    : [];
  const availableProducts = products
    .filter(
      (product) =>
        (product.isActive || draft?.productIds.includes(product._id)) &&
        `${product.name} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setDraft(undefined);
          setError("");
        }}
      >
        Manage discounts
      </Button>
      <Button
        disabled={!selectedIds.length}
        onClick={() => {
          setError("");
          setSearch("");
          setOpen(true);
          setDraft({
            name: "",
            type: "PERCENTAGE",
            value: "",
            productIds: selectedIds,
            startNow: true,
            startsAt: manilaInput(now),
            endsAt: manilaInput(now + 24 * 3600_000),
            isEnabled: true,
          });
        }}
      >
        Set discount{selectedIds.length ? ` (${selectedIds.length})` : ""}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {draft ? (draft.id ? "Edit promotion" : "Set discount") : "Manage discounts"}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? "Apply one promotion to the selected products and all their variants. Schedule times are in Philippine time (UTC+08:00)."
              : "Manage scheduled and active promotions. Deactivation applies to all included products."}
          </DialogDescription>
          {discounts.isError && (
            <QueryError message={discounts.error.message} retry={() => void discounts.refetch()} />
          )}
          {draft ? (
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                setError("");
                if (!draft.productIds.length) {
                  setError("Select at least one product.");
                  return;
                }
                if (selected.some((product) => !product.isActive)) {
                  setError("Remove archived products before saving.");
                  return;
                }
                if (draft.productIds.length > 1000) {
                  setError("Select up to 1,000 products per promotion.");
                  return;
                }
                save.mutate(draft);
              }}
            >
              <fieldset disabled={pending} className="space-y-5">
                <label htmlFor="promotion-name" className="block">
                  <Label>Promotion name</Label>
                  <Input
                    id="promotion-name"
                    required
                    maxLength={120}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="promotion-type">
                    <Label>Discount type</Label>
                    <select
                      id="promotion-type"
                      className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm"
                      value={draft.type}
                      onChange={(event) =>
                        setDraft({ ...draft, type: event.target.value as Draft["type"] })
                      }
                    >
                      <option value="PERCENTAGE">Percentage off (%)</option>
                      <option value="FIXED">Fixed amount off (₱ per unit)</option>
                    </select>
                  </label>
                  <label htmlFor="promotion-value">
                    <Label>
                      {draft.type === "PERCENTAGE" ? "Percentage" : "Amount per unit (₱)"}
                    </Label>
                    <Input
                      id="promotion-value"
                      type="number"
                      min="0.01"
                      max={draft.type === "PERCENTAGE" ? 100 : undefined}
                      step="0.01"
                      required
                      value={draft.value}
                      onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.startNow}
                    onChange={(event) => setDraft({ ...draft, startNow: event.target.checked })}
                  />
                  Start now
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {!draft.startNow && (
                    <label htmlFor="promotion-start">
                      <Label>Starts at · Philippine time</Label>
                      <Input
                        id="promotion-start"
                        type="datetime-local"
                        step="1"
                        required
                        value={draft.startsAt}
                        onInput={(event) =>
                          setDraft({ ...draft, startsAt: event.currentTarget.value })
                        }
                        onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                      />
                    </label>
                  )}
                  <label htmlFor="promotion-end">
                    <Label>Ends at · Philippine time</Label>
                    <Input
                      id="promotion-end"
                      type="datetime-local"
                      step="1"
                      required
                      value={draft.endsAt}
                      onInput={(event) => setDraft({ ...draft, endsAt: event.currentTarget.value })}
                      onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    onChange={(event) => setDraft({ ...draft, isEnabled: event.target.checked })}
                  />
                  Promotion enabled
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Products ({draft.productIds.length} selected)
                  </p>
                  <Input
                    aria-label="Search promotion products"
                    placeholder="Search products or categories"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-pink-100 p-3">
                    {availableProducts.map((product) => (
                      <label key={product._id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.productIds.includes(product._id)}
                          disabled={!product.isActive && !draft.productIds.includes(product._id)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              productIds: event.target.checked
                                ? [...draft.productIds, product._id]
                                : draft.productIds.filter((id) => id !== product._id),
                            })
                          }
                        />
                        {product.name}
                        {!product.isActive ? " (archived — remove to save)" : ""}
                      </label>
                    ))}
                    {!availableProducts.length && (
                      <p className="text-sm text-stone-500">No matching products.</p>
                    )}
                  </div>
                </div>
                {Number(draft.value) > 0 && selected.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Price preview · per unit</p>
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl bg-pink-50 p-3 text-sm">
                      {selected.flatMap((product) =>
                        (product.variants.length
                          ? product.variants.map((variant) => ({
                              id: `${product._id}:${variant.variantId}`,
                              name: `${product.name} · ${variant.name}`,
                              price: Number(variant.price),
                            }))
                          : [
                              {
                                id: product._id,
                                name: product.name,
                                price: Number(product.basePrice),
                              },
                            ]
                        ).map((entry) => (
                          <div key={entry.id} className="flex flex-wrap justify-between gap-2">
                            <span>{entry.name}</span>
                            <span>
                              {formatPeso(entry.price)} →{" "}
                              <strong>
                                {formatPeso(
                                  previewDiscount(entry.price, draft.type, Number(draft.value)),
                                )}
                              </strong>
                            </span>
                          </div>
                        )),
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      Reductions are capped at the price. Original prices are preserved.
                    </p>
                  </div>
                )}
                {conflicts.length > 0 && (
                  <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    Deactivate conflicting promotions first:{" "}
                    {conflicts.map((promotion) => promotion.name).join(", ")}.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    disabled={
                      pending || !draft.productIds.length || conflicts.length > 0 || !discounts.data
                    }
                  >
                    {save.isPending ? "Saving..." : "Save promotion"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDraft(undefined)}>
                    Back to promotions
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              {discounts.isLoading && (
                <p className="text-sm text-stone-500">Loading promotions...</p>
              )}
              {discounts.data?.items.length === 0 && (
                <p className="py-8 text-center text-stone-500">
                  Select products in the catalog, then choose Set discount.
                </p>
              )}
              {discounts.data?.items.map((promotion) => {
                const status = discountStatus(promotion, now);
                return (
                  <div
                    key={promotion._id}
                    className="space-y-3 rounded-xl border border-pink-100 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">{promotion.name}</h3>
                      <Badge
                        tone={
                          status === "Active"
                            ? "green"
                            : status === "Scheduled"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      {promotion.type === "PERCENTAGE"
                        ? `${promotion.value}%`
                        : formatPeso(promotion.value)}{" "}
                      off · {promotion.productIds.length} products
                    </p>
                    <p className="text-xs text-stone-500">
                      {new Date(promotion.startsAt).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}{" "}
                      –{" "}
                      {new Date(promotion.endsAt).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}{" "}
                      (Philippine time)
                    </p>
                    <DiscountCountdown discount={{ ...promotion, id: promotion._id }} now={now} />
                    <details className="text-sm">
                      <summary className="cursor-pointer">Included products</summary>
                      <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto">
                        {promotion.productIds.map((id) => (
                          <li key={id}>
                            {products.find((product) => product._id === id)?.name ??
                              "Removed product"}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => edit(promotion)}
                      >
                        Edit
                      </Button>
                      {status !== "Expired" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => toggle.mutate(promotion)}
                        >
                          {promotion.isEnabled ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
