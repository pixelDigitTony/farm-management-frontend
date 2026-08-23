import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { api, resources } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPeso, number } from "@/lib/utils";
import type { InventoryItem } from "@/types/domain";
import { Header } from "./PigsPage";

type InventoryLot = {
  _id: string;
  itemId: string;
  lotCode: string;
  sourceType: string;
  businessUnit: string;
  receivedDate: string;
  remainingQuantityCached: string;
  unitCost: string;
  status: string;
};
type InventoryReceipt = {
  lotId: string;
  movementDate: string;
  itemId: string;
  quantity: string;
  unitCost: string;
  businessUnit: string;
  storageLocation: string;
  expiryDate: string | null;
  amountPaid: string;
  accountId: string;
  notes: string;
};
type InventoryMovement = {
  _id: string;
  movementNumber: string;
  movementDate: string;
  movementType: string;
  itemId: string;
  fromBusinessUnit?: string;
  toBusinessUnit?: string;
  quantity: string;
  unitCostSnapshot: string;
  totalCost: string;
};
type CashAccount = { _id: string; name: string };

export function InventoryPage() {
  const [open, setOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<InventoryReceipt>();
  const [transferOpen, setTransferOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem>();
  const client = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => resources.list<InventoryItem>("inventory-items"),
  });
  const lots = useQuery({
    queryKey: ["inventory-lots"],
    queryFn: () => resources.list<InventoryLot>("inventory-lots", "?limit=100&sort=-receivedDate"),
  });
  const movements = useQuery({
    queryKey: ["inventory-movements"],
    queryFn: () =>
      resources.list<InventoryMovement>("inventory-movements", "?limit=100&sort=-movementDate"),
  });
  const accounts = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<CashAccount>("cash-accounts", "?limit=100"),
  });
  const saveItem = useMutation({
    mutationFn: (p: unknown) =>
      editing
        ? resources.update("inventory-items", editing._id, p)
        : resources.create("inventory-items", p),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setEditing(undefined);
      toast.success(editing ? "Inventory item updated" : "Inventory item added");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => resources.remove("inventory-items", id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["inventory"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Inventory item deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const receiveStock = useMutation({
    mutationFn: (payload: unknown) =>
      api(
        editingReceipt
          ? `/operations/inventory-receipts/${editingReceipt.lotId}`
          : "/operations/inventory-receipts",
        {
          method: editingReceipt ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      for (const key of [
        "inventory",
        "inventory-lots",
        "inventory-movements",
        "cash-accounts",
        "expenses",
        "dashboard",
      ])
        client.invalidateQueries({ queryKey: [key] });
      setReceiptOpen(false);
      setEditingReceipt(undefined);
      toast.success(
        editingReceipt ? "Stock receipt updated" : "Stock received and its cost posted",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const transferMeat = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/meat-transfers", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      for (const key of ["inventory", "inventory-lots", "inventory-movements", "dashboard"])
        client.invalidateQueries({ queryKey: [key] });
      setTransferOpen(false);
      toast.success("Meat transferred to karenderiya without creating cash or revenue");
    },
    onError: (error) => toast.error(error.message),
  });
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    saveItem.mutate({
      ...d,
      ...(editing ? {} : { currentStockCached: 0 }),
      lowStockLevel: Number(d.lowStockLevel),
      defaultKarenderiyaTransferPricePerUnit: Number(d.defaultKarenderiyaTransferPricePerUnit),
      isPerishable: d.isPerishable === "on",
    });
  }
  function startAdd() {
    setEditing(undefined);
    setOpen(true);
  }
  function startEdit(item: InventoryItem) {
    setEditing(item);
    setOpen(true);
  }
  function deleteItem(item: InventoryItem) {
    if (
      window.confirm(
        `Delete ${item.name}? This is only allowed when no recipe or movement uses it.`,
      )
    )
      remove.mutate(item._id);
  }
  async function startReceiptEdit(lot: InventoryLot) {
    try {
      const receipt = await api<InventoryReceipt>(`/operations/inventory-receipts/${lot._id}`);
      setEditingReceipt(receipt);
      setReceiptOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The receipt could not be loaded");
    }
  }
  if (isLoading || lots.isLoading || movements.isLoading || accounts.isLoading)
    return <PageSkeleton cards={8} />;
  if (isError) return <QueryError message={error.message} retry={() => refetch()} />;
  return (
    <div className="space-y-6">
      <Header
        title="Inventory"
        description="One stock catalog for feed, meat parts, and karenderiya ingredients."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(true)}>
            <Icon icon="solar:transfer-horizontal-linear" /> Transfer meat
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingReceipt(undefined);
              setReceiptOpen(true);
            }}
          >
            <Icon icon="solar:inbox-in-linear" /> Receive stock
          </Button>
          <Button onClick={startAdd}>
            <Icon icon="solar:add-circle-linear" />
            Add item
          </Button>
        </div>
      </Header>
      <Tabs defaultValue="items">
        <TabsList className="h-auto grid-cols-3 gap-1">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="lots">Stock lots</TabsTrigger>
          <TabsTrigger value="movements">Movement ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data?.items.map((item) => {
              const low = Number(item.currentStockCached) <= Number(item.lowStockLevel ?? -1);
              return (
                <Card key={item._id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid size-10 place-items-center rounded-xl bg-pink-100 text-pink-700">
                      <Icon
                        icon={
                          item.category === "MEAT"
                            ? "solar:bone-linear"
                            : item.category === "FEED"
                              ? "solar:bag-4-linear"
                              : "solar:box-linear"
                        }
                        className="size-5"
                      />
                    </div>
                    <Badge tone={low ? "amber" : "green"}>{low ? "LOW" : item.businessUnit}</Badge>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{item.name}</h3>
                  <p className="mt-1 text-xs text-stone-400">
                    {item.itemCode} · {item.category}
                  </p>
                  <p className="mt-5 text-2xl font-bold">
                    {Number(item.currentStockCached)}{" "}
                    <span className="text-xs font-medium text-stone-400">{item.baseUnit}</span>
                  </p>
                  <div className="mt-4 flex gap-2 border-t border-pink-100 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => startEdit(item)}
                    >
                      <Icon icon="solar:pen-linear" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      disabled={remove.isPending}
                      onClick={() => deleteItem(item)}
                    >
                      <Icon icon="solar:trash-bin-trash-linear" /> Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="lots" className="mt-5">
          <Card className="overflow-x-auto p-5">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="py-3">Received</th>
                  <th>Lot</th>
                  <th>Item</th>
                  <th>Source</th>
                  <th>Business</th>
                  <th>Remaining</th>
                  <th>Unit cost</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lots.data?.items.map((lot) => {
                  const item = data?.items.find((candidate) => candidate._id === lot.itemId);
                  return (
                    <tr key={lot._id}>
                      <td className="py-4">{format(new Date(lot.receivedDate), "MMM d, yyyy")}</td>
                      <td>{lot.lotCode}</td>
                      <td className="font-semibold">{item?.name ?? "Item"}</td>
                      <td>{lot.sourceType.replaceAll("_", " ")}</td>
                      <td>{lot.businessUnit}</td>
                      <td>
                        {number.format(Number(lot.remainingQuantityCached))} {item?.baseUnit}
                      </td>
                      <td>{formatPeso(lot.unitCost)}</td>
                      <td>
                        <Badge tone={lot.status === "ACTIVE" ? "green" : "neutral"}>
                          {lot.status}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {lot.sourceType === "PURCHASE" && lot.status !== "VOIDED" && (
                          <Button variant="outline" size="sm" onClick={() => startReceiptEdit(lot)}>
                            <Icon icon="solar:pen-linear" /> Edit receipt
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lots.data?.items.length && (
              <p className="py-10 text-center text-sm text-stone-400">
                No stock lots yet. Receive stock or complete a slaughter.
              </p>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="movements" className="mt-5">
          <Card className="overflow-x-auto p-5">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="py-3">Date</th>
                  <th>Reference</th>
                  <th>Item</th>
                  <th>Movement</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Quantity</th>
                  <th>Total cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.data?.items.map((movement) => {
                  const item = data?.items.find((candidate) => candidate._id === movement.itemId);
                  return (
                    <tr key={movement._id}>
                      <td className="py-4">
                        {format(new Date(movement.movementDate), "MMM d, yyyy")}
                      </td>
                      <td>{movement.movementNumber}</td>
                      <td className="font-semibold">{item?.name ?? "Item"}</td>
                      <td>{movement.movementType.replaceAll("_", " ")}</td>
                      <td>{movement.fromBusinessUnit ?? "—"}</td>
                      <td>{movement.toBusinessUnit ?? "—"}</td>
                      <td>
                        {number.format(Number(movement.quantity))} {item?.baseUnit}
                      </td>
                      <td>{formatPeso(movement.totalCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!movements.data?.items.length && (
              <p className="py-10 text-center text-sm text-stone-400">
                No inventory movements yet.
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(undefined);
        }}
      >
        <DialogContent key={editing?._id ?? "new"}>
          <DialogTitle>{editing ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
          <DialogDescription>
            Define the item here, then use Receive stock so every quantity has a cost and movement
            record.
          </DialogDescription>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <Field label="Item code">
              <Input name="itemCode" defaultValue={editing?.itemCode} required />
            </Field>
            <Field label="Name">
              <Input name="name" defaultValue={editing?.name} required />
            </Field>
            <Field label="Business">
              <Select name="businessUnit" defaultValue={editing?.businessUnit ?? "PIGGERY"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIGGERY">Piggery</SelectItem>
                  <SelectItem value="KARENDERIYA">Karenderiya</SelectItem>
                  <SelectItem value="SHARED">Shared</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue={editing?.category ?? "FEED"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "FEED",
                    "MEAT",
                    "BYPRODUCT",
                    "INGREDIENT",
                    "MEDICINE",
                    "PACKAGING",
                    "FUEL",
                    "SUPPLY",
                    "OTHER",
                  ].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Base unit">
              <Select name="baseUnit" defaultValue={editing?.baseUnit ?? "KG"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["KG", "GRAM", "LITER", "ML", "PIECE", "PACK", "SACK", "BOTTLE", "OTHER"].map(
                    (v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-xl bg-pink-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Stock on hand
              </p>
              <p className="mt-1 font-bold">
                {Number(editing?.currentStockCached ?? 0)} {editing?.baseUnit ?? "units"}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Changed only by receiving, usage, transfer, cooking, or sale operations.
              </p>
            </div>
            <Field label="Low-stock level">
              <Input
                name="lowStockLevel"
                type="number"
                min="0"
                step="0.001"
                defaultValue={Number(editing?.lowStockLevel ?? 0)}
              />
            </Field>
            <Field label="Recipe cost / base unit">
              <Input
                name="defaultKarenderiyaTransferPricePerUnit"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(editing?.defaultKarenderiyaTransferPricePerUnit ?? 0)}
              />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                name="isPerishable"
                type="checkbox"
                defaultChecked={editing?.isPerishable}
                className="size-4 accent-pink-700"
              />
              Perishable item
            </label>
            <Button className="sm:col-span-2" disabled={saveItem.isPending}>
              {editing ? "Update item" : "Save item"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={receiptOpen}
        onOpenChange={(next) => {
          setReceiptOpen(next);
          if (!next) setEditingReceipt(undefined);
        }}
      >
        <DialogContent key={editingReceipt?.lotId ?? "new-receipt"} className="max-w-xl">
          <DialogTitle>
            {editingReceipt ? "Edit stock receipt" : "Receive inventory stock"}
          </DialogTitle>
          <DialogDescription>
            {editingReceipt
              ? "Correct the linked stock lot, movement, expense, and cash payment together."
              : "Create a traceable stock lot, inventory movement, expense, and optional cash payment together."}
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = Object.fromEntries(new FormData(event.currentTarget));
              receiveStock.mutate({
                ...form,
                quantity: Number(form.quantity),
                unitCost: Number(form.unitCost),
                amountPaid: Number(form.amountPaid),
                accountId: form.accountId || undefined,
                expiryDate: form.expiryDate || undefined,
              });
            }}
          >
            <Field label="Date">
              <Input
                name="movementDate"
                type="date"
                defaultValue={format(
                  editingReceipt ? new Date(editingReceipt.movementDate) : new Date(),
                  "yyyy-MM-dd",
                )}
                required
              />
            </Field>
            <Field label="Inventory item">
              <OwnerSelect
                name="itemId"
                placeholder="Select item"
                defaultValue={editingReceipt?.itemId}
                items={(data?.items ?? []).map((item) => ({
                  value: item._id,
                  label: `${item.name} · ${item.baseUnit}`,
                }))}
              />
            </Field>
            <Field label="Business">
              <OwnerSelect
                name="businessUnit"
                placeholder="Select business"
                defaultValue={editingReceipt?.businessUnit}
                items={[
                  { value: "PIGGERY", label: "Piggery" },
                  { value: "KARENDERIYA", label: "Karenderiya" },
                ]}
              />
            </Field>
            <Field label="Quantity">
              <Input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                defaultValue={editingReceipt ? Number(editingReceipt.quantity) : undefined}
                required
              />
            </Field>
            <Field label="Cost per base unit">
              <Input
                name="unitCost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingReceipt ? Number(editingReceipt.unitCost) : undefined}
                required
              />
            </Field>
            <Field label="Amount paid now">
              <Input
                name="amountPaid"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingReceipt ? Number(editingReceipt.amountPaid) : 0}
              />
            </Field>
            <Field label="Paid from">
              <OwnerSelect
                name="accountId"
                placeholder="Select if paid"
                defaultValue={editingReceipt?.accountId || undefined}
                required={false}
                items={(accounts.data?.items ?? []).map((account) => ({
                  value: account._id,
                  label: account.name,
                }))}
              />
            </Field>
            <Field label="Storage location">
              <Input
                name="storageLocation"
                placeholder="Stock room / freezer"
                defaultValue={editingReceipt?.storageLocation}
              />
            </Field>
            <Field label="Expiry date">
              <Input
                name="expiryDate"
                type="date"
                defaultValue={
                  editingReceipt?.expiryDate
                    ? format(new Date(editingReceipt.expiryDate), "yyyy-MM-dd")
                    : undefined
                }
              />
            </Field>
            <Field label="Notes">
              <Input name="notes" defaultValue={editingReceipt?.notes} />
            </Field>
            <Button className="sm:col-span-2" disabled={receiveStock.isPending}>
              {editingReceipt ? "Save receipt correction" : "Receive and post stock"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogTitle>Transfer piggery meat to karenderiya</DialogTitle>
          <DialogDescription>
            Move meat at production cost or an owner-set transfer price. This creates no sale,
            revenue, expense, or cash movement.
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = Object.fromEntries(new FormData(event.currentTarget));
              const source = lots.data?.items.find((lot) => lot._id === form.sourceLotId);
              transferMeat.mutate({
                movementDate: form.movementDate,
                sourceLotId: form.sourceLotId,
                inventoryItemId: source?.itemId,
                quantity: Number(form.quantity),
                transferPricePerKg: form.transferPricePerKg
                  ? Number(form.transferPricePerKg)
                  : undefined,
                storageLocation: form.storageLocation,
                notes: form.notes,
              });
            }}
          >
            <Field label="Date">
              <Input
                name="movementDate"
                type="date"
                defaultValue={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </Field>
            <Field label="Piggery meat lot">
              <OwnerSelect
                name="sourceLotId"
                placeholder="Select meat lot"
                items={(lots.data?.items ?? [])
                  .filter(
                    (lot) =>
                      lot.status === "ACTIVE" &&
                      lot.businessUnit === "PIGGERY" &&
                      ["MEAT", "BYPRODUCT"].includes(
                        data?.items.find((item) => item._id === lot.itemId)?.category ?? "",
                      ),
                  )
                  .map((lot) => {
                    const item = data?.items.find((candidate) => candidate._id === lot.itemId);
                    return {
                      value: lot._id,
                      label: `${item?.name ?? "Meat"} · ${Number(lot.remainingQuantityCached)} kg`,
                    };
                  })}
              />
            </Field>
            <Field label="Quantity (kg)">
              <Input name="quantity" type="number" min="0.001" step="0.001" required />
            </Field>
            <Field label="Transfer price / kg (optional)">
              <Input
                name="transferPricePerKg"
                type="number"
                min="0"
                step="0.01"
                placeholder="Use lot cost when blank"
              />
            </Field>
            <Field label="Karenderiya storage">
              <Input name="storageLocation" placeholder="Freezer" />
            </Field>
            <Field label="Notes">
              <Input name="notes" />
            </Field>
            <Button className="sm:col-span-2" disabled={transferMeat.isPending}>
              Transfer meat
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
function OwnerSelect({
  name,
  placeholder,
  items,
  required = true,
  defaultValue,
}: {
  name: string;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <Select name={name} required={required} defaultValue={defaultValue}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
