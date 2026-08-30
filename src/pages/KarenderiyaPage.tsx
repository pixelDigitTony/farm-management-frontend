import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatPeso } from "@/lib/utils";
import type { InventoryItem, KarenderiyaOrder, MenuItem, Recipe } from "@/types/domain";
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
type OrderLine = {
  id: string;
  menuItemId: string;
  cookingBatchId?: string;
  quantitySold: number;
};
type CookingBatch = {
  _id: string;
  cookingBatchNumber: string;
  cookingDate: string;
  menuItemId: string;
  actualServingsProduced: string;
  servingsSoldCached: string;
  servingsRemainingCached: string;
  totalBatchCost: string;
  costPerServing: string;
  status: string;
};
type MenuPayload = { recipe: Record<string, unknown>; menu: Record<string, unknown> };

const today = () => format(new Date(), "yyyy-MM-dd");
const emptyRecipeLine = (): RecipeLine => ({
  id: crypto.randomUUID(),
  inventoryItemId: "",
  quantity: 1,
});
const emptyOrderLine = (): OrderLine => ({
  id: crypto.randomUUID(),
  menuItemId: "",
  quantitySold: 1,
});

export function KarenderiyaPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderEditOpen, setOrderEditOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [viewingMenu, setViewingMenu] = useState<MenuItem>();
  const [editingMenu, setEditingMenu] = useState<MenuItem>();
  const [editingOrder, setEditingOrder] = useState<KarenderiyaOrder>();
  const [result, setResult] = useState<PriceResult>();
  const [ingredients, setIngredients] = useState<RecipeLine[]>([emptyRecipeLine()]);
  const [mediaLinks, setMediaLinks] = useState<MenuMediaLink[]>(() => createMenuMediaLinks());
  const [orderLines, setOrderLines] = useState<OrderLine[]>([emptyOrderLine()]);
  const [orderDate, setOrderDate] = useState(today());
  const client = useQueryClient();

  const menuQuery = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => resources.list<MenuItem>("menu-items", "?limit=100&sort=name"),
  });
  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: () => resources.list<InventoryItem>("inventory-items", "?limit=100&sort=name"),
  });
  const recipeQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: () => resources.list<Recipe>("recipes", "?limit=100&sort=name"),
  });
  const orderQuery = useQuery({
    queryKey: ["karenderiya-orders", orderDate],
    queryFn: () =>
      resources.list<KarenderiyaOrder>(
        "karenderiya-sales",
        `?salesDate=${orderDate}&status=POSTED&limit=100&sort=-createdAt`,
      ),
  });
  const batchQuery = useQuery({
    queryKey: ["cooking-batches"],
    queryFn: () => resources.list<CookingBatch>("cooking-batches", "?limit=100&sort=-cookingDate"),
  });
  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<{ _id: string; name: string }>("cash-accounts", "?limit=100"),
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
      api(
        editingMenu ? `/operations/menu-recipes/${editingMenu._id}` : "/operations/menu-recipes",
        {
          method: editingMenu ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["menu-items"] });
      client.invalidateQueries({ queryKey: ["recipes"] });
      setMenuOpen(false);
      setEditingMenu(undefined);
      setResult(undefined);
      toast.success(editingMenu ? "Menu item updated" : "Menu item added");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMenu = useMutation({
    mutationFn: (menu: MenuItem) => resources.remove("menu-items", menu._id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["menu-items"] });
      toast.success("Menu item deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const recordOrder = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/karenderiya-sales", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["karenderiya-orders"] });
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["cooking-batches"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setOrderOpen(false);
      setOrderLines([emptyOrderLine()]);
      toast.success("Order posted and recipe stock deducted");
    },
    onError: (error) => toast.error(error.message),
  });
  const recordBatch = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/cooking-batches", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["cooking-batches"] });
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["inventory-movements"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setBatchOpen(false);
      toast.success("Cooking batch completed and recipe ingredients deducted");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateOrder = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      api(`/operations/karenderiya-sales/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["karenderiya-orders"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setOrderEditOpen(false);
      setEditingOrder(undefined);
      toast.success("Order date updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeOrder = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/operations/karenderiya-sales/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["karenderiya-orders"] });
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Order deleted; cash and ingredient stock were restored");
    },
    onError: (error) => toast.error(error.message),
  });

  const inventoryItems = inventoryQuery.data?.items ?? [];
  const recipes = recipeQuery.data?.items ?? [];
  const menus = menuQuery.data?.items ?? [];

  function itemCost(item?: InventoryItem) {
    return Number(
      item?.defaultKarenderiyaTransferPricePerUnit ?? item?.defaultExternalPricePerUnit ?? 0,
    );
  }
  function menuValues(form: HTMLFormElement) {
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
    const values = menuValues(event.currentTarget);
    calculator.mutate({
      ingredients: ingredients.map((line) => ({
        quantity: line.quantity,
        unitCost: itemCost(inventoryItems.find((item) => item._id === line.inventoryItemId)),
      })),
      additionalCosts: values.additionalCost,
      servings: values.servings,
      sellingPrice: values.sellingPrice,
      targetFoodCostPercent: values.targetFoodCostPercent,
    });
  }
  function save(form: HTMLFormElement) {
    if (!result) return toast.error("Calculate the recipe first");
    const values = menuValues(form);
    const mediaUrls = normalizeMediaUrls(mediaLinks.map((link) => link.value));
    if (mediaUrls.some((url) => !getMenuMediaEmbed(url))) {
      toast.error("Enter a valid Drive, YouTube, Instagram, or Facebook media link");
      return;
    }
    const code = editingMenu?.menuCode ?? `MENU-${Date.now().toString().slice(-6)}`;
    saveMenu.mutate({
      recipe: {
        recipeCode: code,
        name: values.name,
        yieldServings: values.servings,
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
        preparationCosts: [{ name: "Additional preparation cost", amount: values.additionalCost }],
        estimatedIngredientCostCached: result.ingredientCost,
        estimatedPreparationCostCached: values.additionalCost,
        estimatedBatchCostCached: result.batchCost,
        estimatedCostPerServingCached: result.costPerServing,
      },
      menu: {
        menuCode: code,
        name: values.name,
        mediaUrls,
        googleDriveUrl: null,
        googleDriveUrls: [],
        sellingPricePerServing: values.sellingPrice,
        targetFoodCostPercent: values.targetFoodCostPercent,
        calculatedCostPerServingCached: result.costPerServing,
        calculatedProfitPerServingCached: result.profitPerServing,
        calculatedFoodCostPercentCached: result.foodCostPercent,
        suggestedSellingPriceCached: result.suggestedPrice,
        isAvailable: values.isAvailable,
      },
    });
  }
  function startAddMenu() {
    setEditingMenu(undefined);
    setIngredients([emptyRecipeLine()]);
    setMediaLinks(createMenuMediaLinks());
    setResult(undefined);
    setMenuOpen(true);
  }
  function startEditMenu(menu: MenuItem) {
    const recipe = recipes.find((item) => item._id === menu.recipeId);
    setEditingMenu(menu);
    const savedMediaLinks = getMenuMediaUrls(menu);
    setMediaLinks(createMenuMediaLinks(savedMediaLinks));
    setIngredients(
      recipe?.ingredients.length
        ? recipe.ingredients.map((line) => ({
            id: crypto.randomUUID(),
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
          }))
        : [emptyRecipeLine()],
    );
    setResult(undefined);
    setMenuOpen(true);
  }
  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (orderLines.some((line) => !line.menuItemId || line.quantitySold <= 0)) {
      toast.error("Complete every order line");
      return;
    }
    recordOrder.mutate({
      salesDate: data.salesDate,
      receivingAccountId: data.receivingAccountId,
      notes: data.notes,
      items: orderLines.map(({ menuItemId, cookingBatchId, quantitySold }) => ({
        menuItemId,
        cookingBatchId: cookingBatchId || undefined,
        quantitySold,
      })),
    });
  }

  if (
    menuQuery.isLoading ||
    inventoryQuery.isLoading ||
    recipeQuery.isLoading ||
    batchQuery.isLoading
  )
    return <PageSkeleton cards={6} />;
  if (menuQuery.isError)
    return <QueryError message={menuQuery.error.message} retry={() => menuQuery.refetch()} />;

  return (
    <div className="space-y-6">
      <Header
        title="Karenderiya"
        description="Recipes use live inventory items; dated orders deduct their ingredients automatically."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={startAddMenu}>
            <Icon icon="solar:add-circle-linear" /> New menu item
          </Button>
          <Button variant="outline" onClick={() => setBatchOpen(true)}>
            <Icon icon="solar:oven-mitts-linear" /> Cook batch
          </Button>
          <Button onClick={() => setOrderOpen(true)}>
            <Icon icon="solar:bill-list-linear" /> Add order transaction
          </Button>
        </div>
      </Header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {menus.map((item) => (
          <Card key={item._id} className="overflow-hidden">
            <div className="h-2 bg-pink-300" />
            <CardHeader>
              <div className="flex justify-between gap-3">
                <div>
                  <CardTitle>{item.name}</CardTitle>
                  <p className="mt-1 text-xs text-stone-400">{item.menuCode}</p>
                </div>
                <Badge tone={item.isAvailable ? "green" : "neutral"}>
                  {item.isAvailable ? "AVAILABLE" : "PAUSED"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MenuMetric label="Price" value={formatPeso(item.sellingPricePerServing)} />
                <MenuMetric label="Cost" value={formatPeso(item.calculatedCostPerServingCached)} />
                <MenuMetric
                  label="Profit"
                  value={formatPeso(item.calculatedProfitPerServingCached)}
                  green
                />
              </div>
              <div className="mt-4 flex gap-2 border-t border-pink-100 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setViewingMenu(item)}
                >
                  <Icon icon="solar:eye-linear" /> View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => startEditMenu(item)}
                >
                  <Icon icon="solar:pen-linear" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  disabled={removeMenu.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${item.name}? Existing order history will prevent deletion.`,
                      )
                    )
                      removeMenu.mutate(item);
                  }}
                >
                  <Icon icon="solar:trash-bin-trash-linear" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prepared cooking batches</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="py-3">Date</th>
                <th>Reference</th>
                <th>Menu</th>
                <th>Produced</th>
                <th>Sold</th>
                <th>Remaining</th>
                <th>Cost / serving</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batchQuery.data?.items.map((batch) => (
                <tr key={batch._id}>
                  <td className="py-4">{format(new Date(batch.cookingDate), "MMM d, yyyy")}</td>
                  <td>{batch.cookingBatchNumber}</td>
                  <td className="font-semibold">
                    {menus.find((menu) => menu._id === batch.menuItemId)?.name ?? "Menu item"}
                  </td>
                  <td>{Number(batch.actualServingsProduced)}</td>
                  <td>{Number(batch.servingsSoldCached)}</td>
                  <td>{Number(batch.servingsRemainingCached)}</td>
                  <td>{formatPeso(batch.costPerServing)}</td>
                  <td>
                    <Badge tone={batch.status === "COMPLETED" ? "green" : "neutral"}>
                      {batch.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!batchQuery.data?.items.length && (
            <p className="py-10 text-center text-sm text-stone-400">No cooking batches yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>Order transactions</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              Posted orders and totals for one business date.
            </p>
          </div>
          <div className="w-44">
            <Label>Transaction date</Label>
            <Input
              id="order-filter-date"
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="py-3">Reference</th>
                <th>Items</th>
                <th>Profit</th>
                <th className="text-right">Total</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orderQuery.data?.items.map((order) => (
                <tr key={order._id}>
                  <td className="py-4 font-medium">{order.salesNumber}</td>
                  <td>
                    {order.items
                      .map((line) => `${line.menuNameSnapshot} × ${Number(line.quantitySold)}`)
                      .join(", ")}
                  </td>
                  <td className="font-semibold text-emerald-700">
                    {formatPeso(order.grossProfit)}
                  </td>
                  <td className="text-right font-bold">{formatPeso(order.netSales)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingOrder(order);
                          setOrderEditOpen(true);
                        }}
                      >
                        <Icon icon="solar:pen-linear" /> Edit date
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        disabled={removeOrder.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${order.salesNumber}? Cash and stock deductions will be reversed.`,
                            )
                          )
                            removeOrder.mutate(order._id);
                        }}
                      >
                        <Icon icon="solar:trash-bin-trash-linear" /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orderQuery.data?.items.length && (
            <p className="py-10 text-center text-sm text-stone-400">No orders for this date.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (!next) setEditingMenu(undefined);
        }}
      >
        <DialogContent key={editingMenu?._id ?? "new"} className="max-w-2xl">
          <DialogTitle>{editingMenu ? "Edit menu recipe" : "Create menu recipe"}</DialogTitle>
          <DialogDescription>
            Choose inventory ingredients and enter the amount used for one full recipe batch.
          </DialogDescription>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={calculate}>
            <Field label="Menu name">
              <Input
                name="name"
                defaultValue={editingMenu?.name}
                required
                placeholder="Pork adobo"
              />
            </Field>
            <Field label="Servings produced by recipe">
              <Input
                name="servings"
                type="number"
                min="1"
                step="1"
                defaultValue={Number(
                  recipes.find((r) => r._id === editingMenu?.recipeId)?.yieldServings ?? 10,
                )}
                required
              />
            </Field>
            <div className="sm:col-span-2 space-y-3 rounded-2xl border border-pink-100 bg-pink-50/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Recipe ingredients</p>
                  <p className="text-xs text-stone-500">
                    Quantity is deducted proportionally for each serving sold.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIngredients([...ingredients, emptyRecipeLine()])}
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
                      onValueChange={(value) =>
                        setIngredients(
                          ingredients.map((item, i) =>
                            i === index ? { ...item, inventoryItemId: value } : item,
                          ),
                        )
                      }
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
                      onChange={(event) =>
                        setIngredients(
                          ingredients.map((item, i) =>
                            i === index ? { ...item, quantity: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove ingredient"
                      disabled={ingredients.length === 1}
                      onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                    >
                      <Icon icon="solar:trash-bin-trash-linear" />
                    </Button>
                    {selected && (
                      <p className="text-xs text-stone-500 sm:col-span-3">
                        {selected.baseUnit} · {formatPeso(itemCost(selected))} per unit ·{" "}
                        {Number(selected.currentStockCached)} available
                      </p>
                    )}
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
                  recipes.find((r) => r._id === editingMenu?.recipeId)?.preparationCosts?.[0]
                    ?.amount ?? 0,
                )}
              />
            </Field>
            <Field label="Selling price / serving">
              <Input
                name="sellingPrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(editingMenu?.sellingPricePerServing ?? 0)}
                required
              />
            </Field>
            <Field label="Target food cost %">
              <Input
                name="targetFoodCostPercent"
                type="number"
                min="1"
                max="100"
                defaultValue={Number(editingMenu?.targetFoodCostPercent ?? 35)}
                required
              />
            </Field>
            <MenuMediaFields links={mediaLinks} onChange={setMediaLinks} />
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                name="isAvailable"
                type="checkbox"
                defaultChecked={editingMenu?.isAvailable ?? true}
                className="size-4 accent-pink-700"
              />
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
            {result && (
              <div className="sm:col-span-2 rounded-2xl bg-berry-950 p-5 text-white">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DarkMetric label="Cost / serving" value={formatPeso(result.costPerServing)} />
                  <DarkMetric label="Suggested price" value={formatPeso(result.suggestedPrice)} />
                  <DarkMetric
                    label="Profit / serving"
                    value={formatPeso(result.profitPerServing)}
                  />
                  <DarkMetric label="Food cost" value={`${result.foodCostPercent}%`} />
                </div>
              </div>
            )}
            <Button
              type="button"
              className="sm:col-span-2"
              disabled={!result || saveMenu.isPending}
              onClick={(event) => event.currentTarget.form && save(event.currentTarget.form)}
            >
              {editingMenu ? "Update menu item" : "Save menu item"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <MenuViewDialog
        key={viewingMenu?._id ?? "no-karenderiya-menu-view"}
        menu={viewingMenu}
        onOpenChange={(next) => !next && setViewingMenu(undefined)}
      />

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Add order transaction</DialogTitle>
          <DialogDescription>
            Every order line uses its recipe to deduct the matching inventory quantities.
          </DialogDescription>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submitOrder}>
            <Field label="Transaction date">
              <Input name="salesDate" type="date" defaultValue={orderDate} required />
            </Field>
            <Field label="Money received in">
              <Select name="receivingAccountId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select cash account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2 space-y-3 rounded-2xl border border-pink-100 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Order items</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOrderLines([...orderLines, emptyOrderLine()])}
                >
                  <Icon icon="solar:add-circle-linear" /> Add line
                </Button>
              </div>
              {orderLines.map((line, index) => (
                <div
                  key={line.id}
                  className="grid gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
                >
                  <div>
                    <Label>Menu item</Label>
                    <Select
                      value={line.menuItemId}
                      onValueChange={(value) =>
                        setOrderLines(
                          orderLines.map((item, i) =>
                            i === index
                              ? { ...item, menuItemId: value, cookingBatchId: undefined }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select menu item" />
                      </SelectTrigger>
                      <SelectContent>
                        {menus
                          .filter((menu) => menu.isAvailable)
                          .map((menu) => (
                            <SelectItem key={menu._id} value={menu._id}>
                              {menu.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount ordered</Label>
                    <Input
                      aria-label="Amount ordered"
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantitySold}
                      onChange={(event) =>
                        setOrderLines(
                          orderLines.map((item, i) =>
                            i === index
                              ? { ...item, quantitySold: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    disabled={orderLines.length === 1}
                    onClick={() => setOrderLines(orderLines.filter((_, i) => i !== index))}
                  >
                    <Icon icon="solar:trash-bin-trash-linear" />
                  </Button>
                  <div className="sm:col-span-3">
                    <Label>Prepared batch (optional)</Label>
                    <Select
                      value={line.cookingBatchId}
                      onValueChange={(value) =>
                        setOrderLines(
                          orderLines.map((item, i) =>
                            i === index ? { ...item, cookingBatchId: value } : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Deduct recipe directly, or select a prepared batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {(batchQuery.data?.items ?? [])
                          .filter(
                            (batch) =>
                              batch.menuItemId === line.menuItemId &&
                              batch.status === "COMPLETED" &&
                              Number(batch.servingsRemainingCached) >= line.quantitySold,
                          )
                          .map((batch) => (
                            <SelectItem key={batch._id} value={batch._id}>
                              {batch.cookingBatchNumber} · {Number(batch.servingsRemainingCached)}{" "}
                              servings left · {formatPeso(batch.costPerServing)} each
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <textarea
                name="notes"
                className="min-h-20 w-full rounded-xl border border-pink-100 bg-white p-3 text-sm outline-none focus:border-pink-600"
              />
            </div>
            <Button className="sm:col-span-2" disabled={recordOrder.isPending}>
              Post order
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogTitle>Complete a cooking batch</DialogTitle>
          <DialogDescription>
            Deduct the full recipe from inventory now, then sell servings from this prepared batch
            during the day.
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = Object.fromEntries(new FormData(event.currentTarget));
              recordBatch.mutate({
                cookingDate: data.cookingDate,
                menuItemId: data.menuItemId,
                actualServingsProduced: Number(data.actualServingsProduced),
                additionalCosts:
                  Number(data.additionalCost) > 0
                    ? [
                        {
                          name: "Cooking fuel and preparation",
                          amount: Number(data.additionalCost),
                        },
                      ]
                    : [],
                notes: data.notes,
              });
            }}
          >
            <Field label="Cooking date">
              <Input name="cookingDate" type="date" defaultValue={today()} required />
            </Field>
            <Field label="Menu item">
              <Select name="menuItemId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select menu" />
                </SelectTrigger>
                <SelectContent>
                  {menus
                    .filter((menu) => menu.isAvailable)
                    .map((menu) => (
                      <SelectItem key={menu._id} value={menu._id}>
                        {menu.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Actual servings produced">
              <Input name="actualServingsProduced" type="number" min="1" step="1" required />
            </Field>
            <Field label="Additional batch cost">
              <Input name="additionalCost" type="number" min="0" step="0.01" defaultValue="0" />
            </Field>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input name="notes" />
            </div>
            <Button className="sm:col-span-2" disabled={recordBatch.isPending}>
              Complete cooking batch
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={orderEditOpen} onOpenChange={setOrderEditOpen}>
        <DialogContent key={editingOrder?._id}>
          <DialogTitle>Edit order transaction</DialogTitle>
          <DialogDescription>
            Correct the business date or notes without changing posted cash and stock amounts.
          </DialogDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editingOrder) return;
              const data = Object.fromEntries(new FormData(event.currentTarget));
              updateOrder.mutate({
                id: editingOrder._id,
                payload: { salesDate: data.salesDate, notes: data.notes },
              });
            }}
          >
            <Field label="Transaction date">
              <Input
                name="salesDate"
                type="date"
                defaultValue={editingOrder?.salesDate.slice(0, 10)}
                required
              />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                defaultValue={editingOrder?.notes}
                className="min-h-24 w-full rounded-xl border border-pink-100 bg-white p-3 text-sm outline-none focus:border-pink-600"
              />
            </Field>
            <Button className="w-full" disabled={updateOrder.isPending}>
              Update order
            </Button>
          </form>
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
function MenuMetric({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <p className={`text-sm font-bold ${green ? "text-emerald-700" : ""}`}>{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  );
}
function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-pink-200/70">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
