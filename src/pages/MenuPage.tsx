import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { api, resources } from "@/api/client";
import {
  createMenuMediaLinks,
  MenuMediaFields,
  type MenuMediaLink,
} from "@/components/GoogleDriveMediaFields";
import { MenuViewDialog } from "@/components/MenuViewDialog";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/skeleton";
import { getMenuMediaEmbed, getMenuMediaUrls, normalizeMediaUrls } from "@/lib/google-drive";
import { formatPeso, number } from "@/lib/utils";
import type { InventoryItem, MenuItem, Recipe } from "@/types/domain";
import { Header } from "./PigsPage";

type PriceResult = {
  ingredientCost: string;
  batchCost: string;
  costPerServing: string;
  suggestedPrice: string;
  profitPerServing: string;
  foodCostPercent: string;
};
type RecipeLine = { id: string; inventoryItemId: string; quantity: number };
type MenuPayload = { recipe: Record<string, unknown>; menu: Record<string, unknown> };

const emptyLine = (): RecipeLine => ({
  id: crypto.randomUUID(),
  inventoryItemId: "",
  quantity: 1,
});

export function MenuPage() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<MenuItem>();
  const [editing, setEditing] = useState<MenuItem>();
  const [deleting, setDeleting] = useState<MenuItem>();
  const [ingredients, setIngredients] = useState<RecipeLine[]>([emptyLine()]);
  const [mediaLinks, setMediaLinks] = useState<MenuMediaLink[]>(() => createMenuMediaLinks());
  const [result, setResult] = useState<PriceResult>();

  const menus = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => resources.list<MenuItem>("menu-items", "?limit=100&sort=name"),
  });
  const recipes = useQuery({
    queryKey: ["recipes"],
    queryFn: () => resources.list<Recipe>("recipes", "?limit=100&sort=name"),
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => resources.list<InventoryItem>("inventory-items", "?limit=100&sort=name"),
  });

  const calculator = useMutation({
    mutationFn: (payload: unknown) =>
      api<PriceResult>("/calculations/menu-price", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: setResult,
    onError: (error) => toast.error(error.message),
  });
  const saveMenu = useMutation({
    mutationFn: (payload: MenuPayload) =>
      api(editing ? `/operations/menu-recipes/${editing._id}` : "/operations/menu-recipes", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["menu-items"] });
      client.invalidateQueries({ queryKey: ["recipes"] });
      setOpen(false);
      setEditing(undefined);
      setResult(undefined);
      toast.success(editing ? "Menu item updated" : "Menu item created");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMenu = useMutation({
    mutationFn: (menu: MenuItem) => resources.remove("menu-items", menu._id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["menu-items"] });
      client.invalidateQueries({ queryKey: ["recipes"] });
      setDeleting(undefined);
      toast.success("Menu item deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const menuItems = menus.data?.items ?? [];
  const recipeItems = recipes.data?.items ?? [];
  const inventoryItems = inventory.data?.items ?? [];

  function itemCost(item?: InventoryItem) {
    return Number(
      item?.defaultKarenderiyaTransferPricePerUnit ?? item?.defaultExternalPricePerUnit ?? 0,
    );
  }
  function values(form: HTMLFormElement) {
    const data = Object.fromEntries(new FormData(form));
    return {
      name: String(data.name),
      servings: Number(data.servings),
      additionalCost: Number(data.additionalCost),
      sellingPrice: Number(data.sellingPrice),
      targetFoodCostPercent: Number(data.targetFoodCostPercent),
      isAvailable: data.isAvailable === "on",
    };
  }
  function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ingredients.some((line) => !line.inventoryItemId || line.quantity <= 0)) {
      toast.error("Complete every recipe ingredient and quantity");
      return;
    }
    const formValues = values(event.currentTarget);
    calculator.mutate({
      ingredients: ingredients.map((line) => ({
        quantity: line.quantity,
        unitCost: itemCost(inventoryItems.find((item) => item._id === line.inventoryItemId)),
      })),
      additionalCosts: formValues.additionalCost,
      servings: formValues.servings,
      sellingPrice: formValues.sellingPrice,
      targetFoodCostPercent: formValues.targetFoodCostPercent,
    });
  }
  function save(form: HTMLFormElement) {
    if (!result) {
      toast.error("Calculate the recipe before saving");
      return;
    }
    const formValues = values(form);
    const mediaUrls = normalizeMediaUrls(mediaLinks.map((link) => link.value));
    if (mediaUrls.some((url) => !getMenuMediaEmbed(url))) {
      toast.error("Enter a valid Drive, YouTube, Instagram, or Facebook media link");
      return;
    }
    const code = editing?.menuCode ?? `MENU-${Date.now().toString().slice(-6)}`;
    saveMenu.mutate({
      recipe: {
        recipeCode: code,
        name: formValues.name,
        yieldServings: formValues.servings,
        ingredients: ingredients.map((line) => {
          const item = inventoryItems.find((candidate) => candidate._id === line.inventoryItemId);
          return {
            inventoryItemId: line.inventoryItemId,
            itemNameSnapshot: item?.name,
            quantity: line.quantity,
            unit: item?.baseUnit,
            expectedWastePercent: 0,
          };
        }),
        preparationCosts: [
          { name: "Additional preparation cost", amount: formValues.additionalCost },
        ],
        estimatedIngredientCostCached: result.ingredientCost,
        estimatedPreparationCostCached: formValues.additionalCost,
        estimatedBatchCostCached: result.batchCost,
        estimatedCostPerServingCached: result.costPerServing,
      },
      menu: {
        menuCode: code,
        name: formValues.name,
        mediaUrls,
        googleDriveUrl: null,
        googleDriveUrls: [],
        sellingPricePerServing: formValues.sellingPrice,
        targetFoodCostPercent: formValues.targetFoodCostPercent,
        calculatedCostPerServingCached: result.costPerServing,
        calculatedProfitPerServingCached: result.profitPerServing,
        calculatedFoodCostPercentCached: result.foodCostPercent,
        suggestedSellingPriceCached: result.suggestedPrice,
        isAvailable: formValues.isAvailable,
      },
    });
  }
  function startCreate() {
    setEditing(undefined);
    setIngredients([emptyLine()]);
    setMediaLinks(createMenuMediaLinks());
    setResult(undefined);
    setOpen(true);
  }
  function startEdit(menu: MenuItem) {
    const recipe = recipeItems.find((item) => item._id === menu.recipeId);
    setEditing(menu);
    const savedMediaLinks = getMenuMediaUrls(menu);
    setMediaLinks(createMenuMediaLinks(savedMediaLinks));
    setIngredients(
      recipe?.ingredients.length
        ? recipe.ingredients.map((line) => ({
            id: crypto.randomUUID(),
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
          }))
        : [emptyLine()],
    );
    setResult(undefined);
    setOpen(true);
  }

  if (menus.isLoading || recipes.isLoading || inventory.isLoading)
    return <PageSkeleton cards={6} />;
  const failed = [menus, recipes, inventory].find((query) => query.isError);
  if (failed?.isError)
    return <QueryError message={failed.error.message} retry={() => failed.refetch()} />;

  return (
    <div className="space-y-6">
      <Header
        title="Menu"
        description="Manage menu pricing and recipes using live ingredient costs from inventory."
      >
        <Button onClick={startCreate}>
          <Icon icon="solar:add-circle-linear" /> Add menu item
        </Button>
      </Header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-pink-100 bg-pink-50/60 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-4">Menu item</th>
                <th>Recipe</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Profit</th>
                <th>Food cost</th>
                <th>Status</th>
                <th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-100">
              {menuItems.map((menu, index) => {
                const recipe = recipeItems.find((item) => item._id === menu.recipeId);
                return (
                  <motion.tr
                    key={menu._id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.24) }}
                    className="hover:bg-pink-50/35"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-stone-900">{menu.name}</p>
                      <p className="text-xs text-stone-400">{menu.menuCode}</p>
                    </td>
                    <td>
                      <p>{number.format(Number(recipe?.yieldServings ?? 0))} servings</p>
                      <p className="max-w-56 truncate text-xs text-stone-400">
                        {recipe?.ingredients
                          .map((line) => line.itemNameSnapshot ?? "Ingredient")
                          .join(", ") || "No recipe details"}
                      </p>
                    </td>
                    <td className="font-semibold">{formatPeso(menu.sellingPricePerServing)}</td>
                    <td>{formatPeso(menu.calculatedCostPerServingCached)}</td>
                    <td className="font-semibold text-emerald-700">
                      {formatPeso(menu.calculatedProfitPerServingCached)}
                    </td>
                    <td>{number.format(Number(menu.calculatedFoodCostPercentCached ?? 0))}%</td>
                    <td>
                      <Badge tone={menu.isAvailable ? "green" : "neutral"}>
                        {menu.isAvailable ? "AVAILABLE" : "PAUSED"}
                      </Badge>
                    </td>
                    <td className="px-5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(menu)}>
                          <Icon icon="solar:eye-linear" /> View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(menu)}>
                          <Icon icon="solar:pen-linear" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleting(menu)}
                        >
                          <Icon icon="solar:trash-bin-trash-linear" /> Delete
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {!menuItems.length ? (
            <div className="grid min-h-64 place-items-center px-6 text-center">
              <div>
                <Icon
                  icon="solar:notebook-bookmark-linear"
                  className="mx-auto size-12 text-pink-300"
                />
                <p className="mt-3 font-semibold">No menu items yet</p>
                <p className="mt-1 text-sm text-stone-500">
                  Create your first recipe and selling price.
                </p>
                <Button className="mt-4" onClick={startCreate}>
                  Add menu item
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(undefined);
        }}
      >
        <DialogContent key={editing?._id ?? "new"} className="max-w-2xl">
          <DialogTitle>{editing ? "Edit menu recipe" : "Create menu recipe"}</DialogTitle>
          <DialogDescription>
            Choose inventory ingredients and enter the amount used for one full recipe batch.
          </DialogDescription>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={calculate}>
            <Field label="Menu name">
              <Input name="name" defaultValue={editing?.name} required placeholder="Pork adobo" />
            </Field>
            <Field label="Servings produced by recipe">
              <Input
                name="servings"
                type="number"
                min="1"
                step="1"
                defaultValue={Number(
                  recipeItems.find((recipe) => recipe._id === editing?.recipeId)?.yieldServings ??
                    10,
                )}
                required
              />
            </Field>
            <div className="space-y-3 rounded-2xl border border-pink-100 bg-pink-50/40 p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Recipe ingredients</p>
                  <p className="text-xs text-stone-500">Used to calculate cost and deduct stock.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIngredients([...ingredients, emptyLine()])}
                >
                  <Icon icon="solar:add-circle-linear" /> Add ingredient
                </Button>
              </div>
              {ingredients.map((line, index) => {
                const selected = inventoryItems.find((item) => item._id === line.inventoryItemId);
                return (
                  <div key={line.id} className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                    <Select
                      value={line.inventoryItemId}
                      onValueChange={(value) => {
                        setIngredients(
                          ingredients.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, inventoryItemId: value } : item,
                          ),
                        );
                        setResult(undefined);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select inventory item" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item._id} value={item._id}>
                            {item.name} · {Number(item.currentStockCached)} {item.baseUnit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label="Recipe quantity"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => {
                        setIngredients(
                          ingredients.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, quantity: Number(event.target.value) }
                              : item,
                          ),
                        );
                        setResult(undefined);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove ingredient"
                      disabled={ingredients.length === 1}
                      onClick={() => {
                        setIngredients(ingredients.filter((_, itemIndex) => itemIndex !== index));
                        setResult(undefined);
                      }}
                    >
                      <Icon icon="solar:trash-bin-trash-linear" />
                    </Button>
                    {selected ? (
                      <p className="text-xs text-stone-500 sm:col-span-3">
                        {selected.baseUnit} · {formatPeso(itemCost(selected))} per unit ·{" "}
                        {Number(selected.currentStockCached)} available
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Field label="Additional batch cost">
              <Input
                name="additionalCost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(
                  recipeItems.find((recipe) => recipe._id === editing?.recipeId)
                    ?.preparationCosts?.[0]?.amount ?? 0,
                )}
                onChange={() => setResult(undefined)}
              />
            </Field>
            <Field label="Selling price / serving">
              <Input
                name="sellingPrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(editing?.sellingPricePerServing ?? 0)}
                onChange={() => setResult(undefined)}
                required
              />
            </Field>
            <Field label="Target food cost %">
              <Input
                name="targetFoodCostPercent"
                type="number"
                min="1"
                max="100"
                defaultValue={Number(editing?.targetFoodCostPercent ?? 35)}
                onChange={() => setResult(undefined)}
                required
              />
            </Field>
            <MenuMediaFields links={mediaLinks} onChange={setMediaLinks} />
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                name="isAvailable"
                type="checkbox"
                defaultChecked={editing?.isAvailable ?? true}
                className="size-4 accent-pink-700"
              />{" "}
              Available for orders
            </label>
            <Button
              type="submit"
              variant="outline"
              className="sm:col-span-2"
              disabled={calculator.isPending}
            >
              <Icon icon="solar:calculator-linear" /> Calculate recipe
            </Button>
            {result ? (
              <div className="grid grid-cols-2 gap-4 rounded-2xl bg-berry-950 p-5 text-white sm:col-span-2 sm:grid-cols-4">
                <Metric label="Cost / serving" value={formatPeso(result.costPerServing)} />
                <Metric label="Suggested price" value={formatPeso(result.suggestedPrice)} />
                <Metric label="Profit / serving" value={formatPeso(result.profitPerServing)} />
                <Metric label="Food cost" value={`${result.foodCostPercent}%`} />
              </div>
            ) : null}
            <Button
              type="button"
              className="sm:col-span-2"
              disabled={!result || saveMenu.isPending}
              onClick={(event) => event.currentTarget.form && save(event.currentTarget.form)}
            >
              {editing ? "Update menu item" : "Save menu item"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <MenuViewDialog
        key={viewing?._id ?? "no-menu-view"}
        menu={viewing}
        onOpenChange={(next) => !next && setViewing(undefined)}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(next) => !next && setDeleting(undefined)}>
        <DialogContent>
          <DialogTitle>Delete menu item?</DialogTitle>
          <DialogDescription>
            {deleting?.name} and its unused recipe will be removed. Menu items already used by
            orders or cooking batches cannot be deleted.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!deleting || removeMenu.isPending}
              onClick={() => deleting && removeMenu.mutate(deleting)}
            >
              Delete menu item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label>
      {label}
      {children}
    </Label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-pink-200/65">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
