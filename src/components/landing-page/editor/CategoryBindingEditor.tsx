import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import type { LandingPageComponent } from "@/types/landing-page";

export type CatalogCategory = {
  _id: string;
  name: string;
  sourceType: "PRODUCT" | "MENU_ITEM";
  total: number;
  activeNow: number;
};
export function CategoryBindingEditor({
  block,
  variantId,
  onChange,
}: {
  block: Extract<LandingPageComponent, { type: "CATALOG" | "MENU" }>;
  variantId: string;
  onChange: (block: LandingPageComponent) => void;
}) {
  const categories = useQuery({
    queryKey: ["landing-categories"],
    queryFn: () => api<{ items: CatalogCategory[] }>("/landing-page/categories"),
    refetchOnWindowFocus: true,
  });
  const [query, setQuery] = useState("");
  const [conversion, setConversion] = useState<{
    categoryIds: string[];
    missingReferences: number;
  }>();
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const legacy =
    block.type === "CATALOG" ? block.content.catalogItemRefs : block.content.menuItemIds;
  const binding = block.content.categoryBinding;
  const items = (categories.data?.items ?? []).filter(
    (c) => block.type !== "MENU" || c.sourceType === "MENU_ITEM",
  );
  const shown = items.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = binding?.mode === "SELECTED_CATEGORIES" ? binding.categoryIds : [];
  const replace = (categoryBinding: NonNullable<typeof binding>) =>
    onChange({
      ...block,
      content: {
        ...block.content,
        categoryBinding,
        ...(block.type === "CATALOG" ? { catalogItemRefs: [] } : { menuItemIds: [] }),
      },
    } as LandingPageComponent);
  return (
    <fieldset className="lb-inspector-group">
      <legend>Categories to display</legend>
      {categories.isLoading && <p role="status">Loading categories…</p>}
      {categories.error && (
        <p role="alert">
          {categories.error.message}{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void categories.refetch()}
          >
            Retry categories
          </Button>
        </p>
      )}
      {!binding && legacy.length > 0 ? (
        <>
          <p className="lb-help">
            This draft uses a legacy selection of {legacy.length} individual items. Convert it to
            categories to include all current and future products in those categories.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={converting}
            onClick={async () => {
              setConverting(true);
              setError("");
              try {
                setConversion(
                  await api(
                    `/landing-page/category-conversion?variantId=${encodeURIComponent(variantId)}&blockId=${encodeURIComponent(block.id)}`,
                  ),
                );
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Could not load conversion");
              } finally {
                setConverting(false);
              }
            }}
          >
            Review category conversion
          </Button>
          {conversion && (
            <div className="space-y-2 rounded-lg border border-amber-200 p-3">
              <p>
                {conversion.categoryIds.length} categories will be selected. All eligible products
                in these categories, including future products, will appear after publishing.
              </p>
              {conversion.missingReferences > 0 && (
                <p>
                  {conversion.missingReferences} old items are unavailable. Review the category
                  selection before publishing.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    replace({ mode: "SELECTED_CATEGORIES", categoryIds: conversion.categoryIds });
                    setConversion(undefined);
                  }}
                >
                  Apply conversion
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConversion(undefined)}
                >
                  Cancel conversion
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="lb-field">
            <span>Category selection mode</span>
            <select
              aria-label="Category selection mode"
              value={binding?.mode ?? "ALL_CATEGORIES"}
              onChange={(e) =>
                replace(
                  e.target.value === "ALL_CATEGORIES"
                    ? { mode: "ALL_CATEGORIES" }
                    : { mode: "SELECTED_CATEGORIES", categoryIds: [] },
                )
              }
            >
              <option value="ALL_CATEGORIES">All categories, including future categories</option>
              <option value="SELECTED_CATEGORIES">Selected categories</option>
            </select>
          </label>
          {binding?.mode === "SELECTED_CATEGORIES" && (
            <>
              <label className="lb-field">
                <span>Find categories</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    replace({
                      mode: "SELECTED_CATEGORIES",
                      categoryIds: [...new Set([...selected, ...shown.map((c) => c._id)])],
                    })
                  }
                >
                  Select all listed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => replace({ mode: "SELECTED_CATEGORIES", categoryIds: [] })}
                >
                  Clear selection
                </Button>
              </div>
              <div className="max-h-64 overflow-auto">
                {shown.map((c) => (
                  <label key={c._id} className="lb-checkbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(c._id)}
                      onChange={(e) =>
                        replace({
                          mode: "SELECTED_CATEGORIES",
                          categoryIds: e.target.checked
                            ? [...selected, c._id]
                            : selected.filter((id) => id !== c._id),
                        })
                      }
                    />
                    <span>
                      {c.name} — {c.sourceType === "PRODUCT" ? "products" : "menu"}
                      <small className="block text-stone-500">
                        {c.total} items · {c.activeNow} active now
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {selected
                .filter((id) => !items.some((c) => c._id === id))
                .map((id) => (
                  <p key={id} role="alert">
                    Unavailable category{" "}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        replace({
                          mode: "SELECTED_CATEGORIES",
                          categoryIds: selected.filter((key) => key !== id),
                        })
                      }
                    >
                      Remove missing category
                    </Button>
                  </p>
                ))}
              <p className="lb-help">
                {selected.length} categories selected ·{" "}
                {items
                  .filter((c) => selected.includes(c._id))
                  .reduce((sum, c) => sum + c.activeNow, 0)}{" "}
                active products. An empty selection displays no products.
              </p>
            </>
          )}
          {items.length === 0 && !categories.isLoading && (
            <p className="lb-help">
              No categories yet. Add products in Product Catalog or items in Menu.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
