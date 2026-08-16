import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { api, resources } from "@/api/client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPeso, number } from "@/lib/utils";
import type { InventoryItem, Pig } from "@/types/domain";
import { Header } from "./PigsPage";

type Batch = {
  _id: string;
  batchCode: string;
  name: string;
  currentPen?: string;
  initialHeadCount?: number;
  activeHeadCountCached?: number;
  status: string;
};
type Measurement = {
  _id: string;
  measurementDate: string;
  pigId: string;
  weightKg: string;
};
type FeedUsage = {
  _id: string;
  usageNumber: string;
  usageDate: string;
  quantityUsed: string;
  totalFeedCost: string;
  allocationType: string;
  status: string;
};
type PiggerySale = {
  _id: string;
  saleNumber: string;
  saleDate: string;
  saleType: string;
  totalAmount: string;
  amountReceivedCached: string;
  balanceDueCached: string;
  paymentStatus: string;
};
type CashAccount = { _id: string; name: string };
type InventoryLot = {
  _id: string;
  itemId: string;
  lotCode: string;
  businessUnit: string;
  remainingQuantityCached: string;
  status: string;
};

const today = () => format(new Date(), "yyyy-MM-dd");

export function FarmOperationsPage() {
  const [dialog, setDialog] = useState<"batch" | "weight" | "feed" | "sale" | null>(null);
  const [feedAllocation, setFeedAllocation] = useState<"PIG" | "PIG_BATCH" | "GENERAL">("PIG");
  const [saleType, setSaleType] = useState<"LIVE_PIG" | "MEAT_PART" | "BYPRODUCT">("LIVE_PIG");
  const client = useQueryClient();
  const pigs = useQuery({ queryKey: ["pigs"], queryFn: () => resources.list<Pig>("pigs") });
  const batches = useQuery({
    queryKey: ["pig-batches"],
    queryFn: () => resources.list<Batch>("pig-batches"),
  });
  const measurements = useQuery({
    queryKey: ["pig-measurements"],
    queryFn: () => resources.list<Measurement>("pig-measurements"),
  });
  const feedItems = useQuery({
    queryKey: ["inventory", "feed"],
    queryFn: () => resources.list<InventoryItem>("inventory-items", "?category=FEED"),
  });
  const feedUsage = useQuery({
    queryKey: ["feed-usage"],
    queryFn: () => resources.list<FeedUsage>("feed-usage"),
  });
  const sales = useQuery({
    queryKey: ["piggery-sales"],
    queryFn: () => resources.list<PiggerySale>("piggery-sales"),
  });
  const accounts = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<CashAccount>("cash-accounts"),
  });
  const meatItems = useQuery({
    queryKey: ["inventory", "saleable-meat"],
    queryFn: () => resources.list<InventoryItem>("inventory-items", "?limit=100"),
  });
  const meatLots = useQuery({
    queryKey: ["inventory-lots", "piggery"],
    queryFn: () =>
      resources.list<InventoryLot>(
        "inventory-lots",
        "?businessUnit=PIGGERY&status=ACTIVE&limit=100",
      ),
  });
  const refresh = (...keys: string[]) => {
    for (const key of keys) client.invalidateQueries({ queryKey: [key] });
    client.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const createBatch = useMutation({
    mutationFn: (payload: unknown) => resources.create("pig-batches", payload),
    onSuccess: () => {
      refresh("pig-batches");
      setDialog(null);
      toast.success("Pig batch created");
    },
    onError: (error) => toast.error(error.message),
  });
  const recordWeight = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/pig-measurements", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      refresh("pigs", "pig-measurements");
      setDialog(null);
      toast.success("Weight recorded");
    },
    onError: (error) => toast.error(error.message),
  });
  const recordFeed = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/feed-usage", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      refresh("pigs", "feed-usage", "inventory");
      setDialog(null);
      toast.success("Feed usage posted and pig cost updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const recordSale = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/piggery-sales", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      refresh("pigs", "piggery-sales", "cash-accounts");
      setDialog(null);
      toast.success("Piggery sale posted");
    },
    onError: (error) => toast.error(error.message),
  });

  if (
    pigs.isLoading ||
    batches.isLoading ||
    measurements.isLoading ||
    feedUsage.isLoading ||
    sales.isLoading
  )
    return <PageSkeleton />;
  const firstError = [pigs, batches, measurements, feedUsage, sales].find((query) => query.isError);
  if (firstError?.isError)
    return (
      <QueryError
        message={firstError.error.message}
        retry={() => {
          pigs.refetch();
          batches.refetch();
          measurements.refetch();
          feedUsage.refetch();
          sales.refetch();
        }}
      />
    );
  const activePigs = pigs.data?.items.filter((pig) => pig.status === "ACTIVE") ?? [];

  return (
    <div className="space-y-6">
      <Header
        title="Piggery operations"
        description="Record growth, feed costs, batches, and piggery sales from one owner logbook."
      />
      <Tabs defaultValue="feed">
        <TabsList className="h-auto grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="feed">Feed usage</TabsTrigger>
          <TabsTrigger value="weights">Weights</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>
        <TabsContent value="feed" className="mt-5 space-y-4">
          <SectionHeader
            title="Feed cost ledger"
            action="Record feed usage"
            onClick={() => setDialog("feed")}
          />
          <Ledger
            headers={["Date", "Reference", "Allocation", "Quantity", "Cost", "Status"]}
            empty="No feed usage recorded yet."
            rows={feedUsage.data?.items.map((usage) => [
              format(new Date(usage.usageDate), "MMM d, yyyy"),
              usage.usageNumber,
              usage.allocationType.replaceAll("_", " "),
              `${number.format(Number(usage.quantityUsed))} kg`,
              formatPeso(usage.totalFeedCost),
              <Badge key={usage._id} tone="green">
                {usage.status}
              </Badge>,
            ])}
          />
        </TabsContent>
        <TabsContent value="weights" className="mt-5 space-y-4">
          <SectionHeader
            title="Weight history"
            action="Record weight"
            onClick={() => setDialog("weight")}
          />
          <Ledger
            headers={["Date", "Pig", "Weight"]}
            empty="No weight measurements recorded yet."
            rows={measurements.data?.items.map((measurement) => [
              format(new Date(measurement.measurementDate), "MMM d, yyyy"),
              pigs.data?.items.find((pig) => pig._id === measurement.pigId)?.pigCode ?? "Pig",
              `${number.format(Number(measurement.weightKg))} kg`,
            ])}
          />
        </TabsContent>
        <TabsContent value="batches" className="mt-5 space-y-4">
          <SectionHeader
            title="Pig batches"
            action="New batch"
            onClick={() => setDialog("batch")}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {batches.data?.items.map((batch) => (
              <Card key={batch._id} className="p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold">{batch.name}</p>
                    <p className="mt-1 text-xs text-stone-400">{batch.batchCode}</p>
                  </div>
                  <Badge tone={batch.status === "ACTIVE" ? "green" : "neutral"}>
                    {batch.status}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Active pigs" value={String(batch.activeHeadCountCached ?? 0)} />
                  <Metric label="Pen" value={batch.currentPen || "—"} />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="sales" className="mt-5 space-y-4">
          <SectionHeader
            title="Piggery sales"
            action="Record pig sale"
            onClick={() => setDialog("sale")}
          />
          <Ledger
            headers={["Date", "Reference", "Type", "Total", "Received", "Balance", "Status"]}
            empty="No piggery sales recorded yet."
            rows={sales.data?.items.map((sale) => [
              format(new Date(sale.saleDate), "MMM d, yyyy"),
              sale.saleNumber,
              sale.saleType.replaceAll("_", " "),
              formatPeso(sale.totalAmount),
              formatPeso(sale.amountReceivedCached),
              formatPeso(sale.balanceDueCached),
              <Badge key={sale._id} tone={sale.paymentStatus === "PAID" ? "green" : "amber"}>
                {sale.paymentStatus}
              </Badge>,
            ])}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent key={dialog} className="max-w-xl">
          {dialog === "batch" && (
            <OperationForm
              title="Create pig batch"
              description="Group pigs that share an arrival date, pen, or feeding plan."
              pending={createBatch.isPending}
              onSubmit={(data) =>
                createBatch.mutate({
                  batchCode: String(data.batchCode),
                  name: String(data.name),
                  arrivalDate: data.arrivalDate,
                  currentPen: data.currentPen,
                  initialHeadCount: Number(data.initialHeadCount),
                  activeHeadCountCached: Number(data.initialHeadCount),
                })
              }
            >
              <Field label="Batch code">
                <Input name="batchCode" required placeholder="BATCH-001" />
              </Field>
              <Field label="Batch name">
                <Input name="name" required placeholder="August growers" />
              </Field>
              <Field label="Arrival date">
                <Input name="arrivalDate" type="date" defaultValue={today()} />
              </Field>
              <Field label="Current pen">
                <Input name="currentPen" placeholder="Pen A" />
              </Field>
              <Field label="Initial head count">
                <Input name="initialHeadCount" type="number" min="1" defaultValue="1" />
              </Field>
            </OperationForm>
          )}
          {dialog === "weight" && (
            <OperationForm
              title="Record pig weight"
              description="Each entry updates the pig’s latest weight while preserving its history."
              pending={recordWeight.isPending}
              onSubmit={(data) =>
                recordWeight.mutate({
                  measurementDate: data.measurementDate,
                  pigId: data.pigId,
                  weightKg: Number(data.weightKg),
                  notes: data.notes,
                })
              }
            >
              <Field label="Date">
                <Input name="measurementDate" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Pig">
                <OwnerSelect
                  name="pigId"
                  placeholder="Select pig"
                  items={activePigs.map((pig) => ({ value: pig._id, label: pig.pigCode }))}
                />
              </Field>
              <Field label="Weight (kg)">
                <Input name="weightKg" type="number" min="0.001" step="0.001" required />
              </Field>
              <Field label="Notes">
                <Input name="notes" />
              </Field>
            </OperationForm>
          )}
          {dialog === "feed" && (
            <OperationForm
              title="Record feed usage"
              description="Deduct feed stock and allocate its cost to one pig, every active pig in a batch, or general piggery use."
              pending={recordFeed.isPending}
              onSubmit={(data) =>
                recordFeed.mutate({
                  usageDate: data.usageDate,
                  feedItemId: data.feedItemId,
                  allocationType: feedAllocation,
                  pigId: feedAllocation === "PIG" ? data.pigId : undefined,
                  batchId: feedAllocation === "PIG_BATCH" ? data.batchId : undefined,
                  quantityUsed: Number(data.quantityUsed),
                  notes: data.notes,
                })
              }
            >
              <Field label="Date">
                <Input name="usageDate" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Feed item">
                <OwnerSelect
                  name="feedItemId"
                  placeholder="Select feed"
                  items={(feedItems.data?.items ?? []).map((item) => ({
                    value: item._id,
                    label: `${item.name} · ${Number(item.currentStockCached)} ${item.baseUnit}`,
                  }))}
                />
              </Field>
              <Field label="Allocate cost to">
                <Select
                  value={feedAllocation}
                  onValueChange={(value) => setFeedAllocation(value as typeof feedAllocation)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIG">One pig</SelectItem>
                    <SelectItem value="PIG_BATCH">Active pigs in batch</SelectItem>
                    <SelectItem value="GENERAL">General piggery use</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {feedAllocation === "PIG" && (
                <Field label="Pig">
                  <OwnerSelect
                    name="pigId"
                    placeholder="Select pig"
                    items={activePigs.map((pig) => ({ value: pig._id, label: pig.pigCode }))}
                  />
                </Field>
              )}
              {feedAllocation === "PIG_BATCH" && (
                <Field label="Pig batch">
                  <OwnerSelect
                    name="batchId"
                    placeholder="Select batch"
                    items={(batches.data?.items ?? [])
                      .filter((batch) => batch.status === "ACTIVE")
                      .map((batch) => ({ value: batch._id, label: batch.name }))}
                  />
                </Field>
              )}
              <Field label="Quantity used (kg)">
                <Input name="quantityUsed" type="number" min="0.001" step="0.001" required />
              </Field>
              <Field label="Notes">
                <Input name="notes" />
              </Field>
            </OperationForm>
          )}
          {dialog === "sale" && (
            <OperationForm
              title="Record piggery sale"
              description="Sell a live pig or slaughtered meat, then post revenue, cash received, cost, profit, and receivable together."
              pending={recordSale.isPending}
              onSubmit={(data) => {
                const lot = meatLots.data?.items.find((item) => item._id === data.inventoryLotId);
                recordSale.mutate({
                  saleDate: data.saleDate,
                  saleType,
                  pigId: saleType === "LIVE_PIG" ? data.pigId : undefined,
                  inventoryItemId: saleType !== "LIVE_PIG" ? lot?.itemId : undefined,
                  inventoryLotId: saleType !== "LIVE_PIG" ? data.inventoryLotId : undefined,
                  description: data.description,
                  headCount: saleType === "LIVE_PIG" ? 1 : undefined,
                  weightKg: saleType !== "LIVE_PIG" ? Number(data.weightKg) : undefined,
                  priceBasis: saleType === "LIVE_PIG" ? "PER_HEAD" : "PER_KG",
                  price: Number(data.price),
                  amountReceived: Number(data.amountReceived),
                  receivingAccountId: data.receivingAccountId || undefined,
                  notes: data.notes,
                });
              }}
            >
              <Field label="Sale date">
                <Input name="saleDate" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Sale type">
                <Select
                  value={saleType}
                  onValueChange={(value) => setSaleType(value as typeof saleType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LIVE_PIG">Live pig</SelectItem>
                    <SelectItem value="MEAT_PART">Meat part</SelectItem>
                    <SelectItem value="BYPRODUCT">Byproduct</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {saleType === "LIVE_PIG" ? (
                <Field label="Pig">
                  <OwnerSelect
                    name="pigId"
                    placeholder="Select pig"
                    items={activePigs.map((pig) => ({ value: pig._id, label: pig.pigCode }))}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Inventory lot">
                    <OwnerSelect
                      name="inventoryLotId"
                      placeholder="Select lot"
                      items={(meatLots.data?.items ?? [])
                        .filter((lot) => {
                          const item = meatItems.data?.items.find(
                            (candidate) => candidate._id === lot.itemId,
                          );
                          return (
                            item?.category === (saleType === "MEAT_PART" ? "MEAT" : "BYPRODUCT")
                          );
                        })
                        .map((lot) => {
                          const item = meatItems.data?.items.find(
                            (candidate) => candidate._id === lot.itemId,
                          );
                          return {
                            value: lot._id,
                            label: `${item?.name ?? "Meat"} · ${Number(lot.remainingQuantityCached)} kg`,
                          };
                        })}
                    />
                  </Field>
                  <Field label="Weight sold (kg)">
                    <Input name="weightKg" type="number" min="0.001" step="0.001" required />
                  </Field>
                </>
              )}
              <Field label="Description">
                <Input
                  name="description"
                  defaultValue={saleType === "LIVE_PIG" ? "Live pig sale" : "Meat sale"}
                  required
                />
              </Field>
              <Field label={saleType === "LIVE_PIG" ? "Price per head" : "Price per kg"}>
                <Input name="price" type="number" min="0.01" step="0.01" required />
              </Field>
              <Field label="Amount received">
                <Input name="amountReceived" type="number" min="0" step="0.01" defaultValue="0" />
              </Field>
              <Field label="Receive in">
                <OwnerSelect
                  name="receivingAccountId"
                  placeholder="Select if paid"
                  required={false}
                  items={(accounts.data?.items ?? []).map((account) => ({
                    value: account._id,
                    label: account.name,
                  }))}
                />
              </Field>
              <Field label="Notes">
                <Input name="notes" />
              </Field>
            </OperationForm>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader({
  title,
  action,
  onClick,
}: {
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-display text-2xl font-semibold">{title}</h3>
      <Button onClick={onClick}>
        <Icon icon="solar:add-circle-linear" />
        {action}
      </Button>
    </div>
  );
}
function Ledger({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows?: React.ReactNode[][];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-2 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows?.map((row) => (
              <tr key={`${String(row[0])}-${String(row[1])}`}>
                {row.map((cell, cellIndex) => (
                  <td key={headers[cellIndex]} className="px-2 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <p className="py-12 text-center text-sm text-stone-400">{empty}</p>}
      </CardContent>
    </Card>
  );
}
function OperationForm({
  title,
  description,
  pending,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  onSubmit: (data: Record<string, FormDataEntryValue>) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <form
        className="mt-6 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        {children}
        <Button className="sm:col-span-2" disabled={pending}>
          {pending ? "Posting…" : "Save and post"}
        </Button>
      </form>
    </>
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
}: {
  name: string;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <Select name={name} required={required}>
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
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-pink-50 p-3">
      <p className="font-bold">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  );
}
