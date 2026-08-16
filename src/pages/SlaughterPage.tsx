import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, resources } from "@/api/client";
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
import { formatPeso, number } from "@/lib/utils";
import type { Pig } from "@/types/domain";
import { Header } from "./PigsPage";

type Part = {
  name: string;
  classification: "MEAT" | "BYPRODUCT" | "WASTE";
  weightKg: number;
  externalPricePerKg: number;
  karenderiyaTransferPricePerKg: number;
};
type Cost = { name: string; amount: number };
type Quote = {
  usableWeightKg: string;
  wasteWeightKg: string;
  unaccountedWeightKg: string;
  slaughterCost: string;
  totalCost: string;
  costPerUsableKg: string;
  dressingPercentage: string;
  usableYieldPercentage: string;
  expectedRevenue: string;
  estimatedProfit: string;
};
type Setting = {
  costItems: Array<{ name: string; defaultRate: string }>;
  meatParts: Array<{
    name: string;
    classification: Part["classification"];
    defaultExternalPricePerKg?: string;
    defaultKarenderiyaPricePerKg?: string;
  }>;
};
type Slaughter = {
  _id: string;
  slaughterNumber: string;
  slaughterDate: string;
  pigId: string;
  liveWeightKg: string;
  wholeCarcassWeightKg: string;
  usablePartsWeightKg: string;
  averageUsableMeatCostPerKg: string;
  dressingPercentage: string;
  usableYieldPercentage: string;
  costLines: Array<{ name: string; amount: string; expenseId?: string }>;
  parts: Array<{
    partName: string;
    classification: Part["classification"];
    weightKg: string;
    externalPricePerKg?: string;
    karenderiyaTransferPricePerKg?: string;
  }>;
  notes?: string;
  status: string;
};
type CashAccount = { _id: string; name: string };
type Expense = {
  _id: string;
  amountPaidCached: string;
  paymentAccountIdCached?: string;
};
type Draft = {
  pigId: string;
  slaughterDate: string;
  liveWeightKg: number;
  carcassWeightKg: number;
  costs: Cost[];
  parts: Part[];
  amountPaid: number;
  accountId?: string;
  notes?: string;
};

const names = [
  "Belly / Liempo",
  "Shoulder / Kasim",
  "Ham / Pigue",
  "Loin / Lomo",
  "Ribs",
  "Head",
  "Legs / Pata",
  "Offal",
  "Fat",
  "Bones",
];
const fallbackParts = (): Part[] =>
  names.map((name) => ({
    name,
    classification: name === "Bones" ? "BYPRODUCT" : "MEAT",
    weightKg: 0,
    externalPricePerKg: 0,
    karenderiyaTransferPricePerKg: 0,
  }));
const fallbackCosts = (): Cost[] =>
  ["Slaughter fee", "Butcher / cutting", "Transport"].map((name) => ({ name, amount: 0 }));

export function SlaughterPage() {
  const client = useQueryClient();
  const [parts, setParts] = useState<Part[]>(fallbackParts());
  const [costs, setCosts] = useState<Cost[]>(fallbackCosts());
  const [pigId, setPigId] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [editing, setEditing] = useState<Slaughter>();
  const [missingExpenseRecord, setMissingExpenseRecord] = useState<Slaughter>();
  const pigs = useQuery({
    queryKey: ["pigs"],
    queryFn: () => resources.list<Pig>("pigs", "?limit=100"),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ slaughter?: Setting }>("/settings"),
  });
  const records = useQuery({
    queryKey: ["slaughters"],
    queryFn: () => resources.list<Slaughter>("slaughters", "?limit=100&sort=-slaughterDate"),
  });
  const accounts = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<CashAccount>("cash-accounts", "?limit=100"),
  });
  const expenses = useQuery({
    queryKey: ["expenses", "slaughter"],
    queryFn: () => resources.list<Expense>("expenses", "?category=SLAUGHTER&limit=100"),
  });
  const selectedPig = pigs.data?.items.find((pig) => pig._id === pigId);
  const editingExpense = expenses.data?.items.find((expense) =>
    editing?.costLines.some((line) => line.expenseId === expense._id),
  );

  useEffect(() => {
    const setting = settings.data?.slaughter;
    if (!setting) return;
    setCosts(
      setting.costItems.map((item) => ({ name: item.name, amount: Number(item.defaultRate) })),
    );
    setParts(
      setting.meatParts.map((item) => ({
        name: item.name,
        classification: item.classification,
        weightKg: 0,
        externalPricePerKg: Number(item.defaultExternalPricePerKg ?? 0),
        karenderiyaTransferPricePerKg: Number(item.defaultKarenderiyaPricePerKg ?? 0),
      })),
    );
  }, [settings.data?.slaughter]);

  const quote = useMutation({
    mutationFn: (payload: unknown) =>
      api<Quote>("/calculations/slaughter", { method: "POST", body: JSON.stringify(payload) }),
    onError: (error) => toast.error(error.message),
  });
  const complete = useMutation({
    mutationFn: (payload: Draft) =>
      api(editing ? `/operations/slaughters/${editing._id}` : "/operations/slaughters", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      for (const key of [
        "pigs",
        "slaughters",
        "inventory",
        "inventory-lots",
        "inventory-movements",
        "expenses",
        "cash-accounts",
        "dashboard",
        "reports",
      ])
        client.invalidateQueries({ queryKey: [key] });
      setDraft(undefined);
      quote.reset();
      setPigId("");
      setEditing(undefined);
      setParts(parts.map((part) => ({ ...part, weightKg: 0 })));
      toast.success(
        editing
          ? "Slaughter record corrected and all linked costs and stock were updated"
          : "Slaughter completed; meat parts and true production costs were added to inventory",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) =>
      api<void>(`/operations/slaughters/${id}${force ? "?forceMissingExpense=true" : ""}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      for (const key of [
        "pigs",
        "slaughters",
        "inventory",
        "inventory-lots",
        "inventory-movements",
        "expenses",
        "cash-accounts",
        "dashboard",
        "reports",
      ])
        client.invalidateQueries({ queryKey: [key] });
      setMissingExpenseRecord(undefined);
      toast.success("Slaughter record deleted and its stock, expense, and cash effects reversed");
    },
    onError: (error, variables) => {
      if (
        !variables.force &&
        error instanceof ApiError &&
        error.code === "SLAUGHTER_EXPENSE_NOT_FOUND"
      ) {
        const record = records.data?.items.find((item) => item._id === variables.id);
        if (record) setMissingExpenseRecord(record);
        return;
      }
      toast.error(error.message);
    },
  });

  function startEdit(record: Slaughter) {
    setEditing(record);
    setPigId(record.pigId);
    setCosts(record.costLines.map((line) => ({ name: line.name, amount: Number(line.amount) })));
    setParts(
      record.parts.map((part) => ({
        name: part.partName,
        classification: part.classification,
        weightKg: Number(part.weightKg),
        externalPricePerKg: Number(part.externalPricePerKg ?? 0),
        karenderiyaTransferPricePerKg: Number(part.karenderiyaTransferPricePerKg ?? 0),
      })),
    );
    setDraft(undefined);
    quote.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(undefined);
    setPigId("");
    setDraft(undefined);
    quote.reset();
    const setting = settings.data?.slaughter;
    setCosts(
      setting?.costItems.map((item) => ({ name: item.name, amount: Number(item.defaultRate) })) ??
        fallbackCosts(),
    );
    setParts(
      setting?.meatParts.map((item) => ({
        name: item.name,
        classification: item.classification,
        weightKg: 0,
        externalPricePerKg: Number(item.defaultExternalPricePerKg ?? 0),
        karenderiyaTransferPricePerKg: Number(item.defaultKarenderiyaPricePerKg ?? 0),
      })) ?? fallbackParts(),
    );
  }

  function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPig) return toast.error("Select an active pig");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const next: Draft = {
      pigId: selectedPig._id,
      slaughterDate: String(data.slaughterDate),
      liveWeightKg: Number(data.liveWeightKg),
      carcassWeightKg: Number(data.carcassWeightKg),
      costs,
      parts,
      amountPaid: Number(data.amountPaid),
      accountId: data.accountId ? String(data.accountId) : undefined,
      notes: data.notes ? String(data.notes) : undefined,
    };
    setDraft(next);
    quote.mutate({
      raisingCost: Number(selectedPig.accumulatedCostCached),
      liveWeightKg: next.liveWeightKg,
      carcassWeightKg: next.carcassWeightKg,
      parts: parts.map((part) => ({ ...part, pricePerKg: part.externalPricePerKg })),
      costs,
    });
  }
  if (
    pigs.isLoading ||
    settings.isLoading ||
    records.isLoading ||
    accounts.isLoading ||
    expenses.isLoading
  )
    return <PageSkeleton />;
  const failed = [pigs, settings, records, accounts, expenses].find((query) => query.isError);
  if (failed?.isError)
    return (
      <QueryError
        message={failed.error.message}
        retry={() => {
          pigs.refetch();
          settings.refetch();
          records.refetch();
          accounts.refetch();
          expenses.refetch();
        }}
      />
    );
  const activePigs =
    pigs.data?.items.filter((pig) => pig.status === "ACTIVE" || pig._id === editing?.pigId) ?? [];

  return (
    <div className="space-y-6">
      <Header
        title={editing ? "Correct slaughter record" : "Slaughter and meat costing"}
        description={
          editing
            ? `Editing ${editing.slaughterNumber}. Recalculate the yield before saving the correction.`
            : "Use the pig’s accumulated raising cost, whole weights, slaughter fees, and part prices to create traceable meat stock."
        }
      >
        {editing && (
          <Button variant="outline" onClick={cancelEdit}>
            <Icon icon="solar:close-circle-linear" /> Cancel correction
          </Button>
        )}
      </Header>
      {editing && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Icon icon="solar:pen-new-square-linear" className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">EDIT MODE</Badge>
                <p className="font-semibold text-amber-950">{editing.slaughterNumber}</p>
              </div>
              <p className="mt-1 text-sm text-amber-800">
                Saving will replace this record’s produced meat stock, slaughter expense, and cash
                effect with the corrected values.
              </p>
            </div>
          </div>
          <p className="text-xs font-medium text-amber-700">
            Original date: {format(new Date(editing.slaughterDate), "MMM d, yyyy")}
          </p>
        </div>
      )}
      <form
        key={editing?._id ?? "new"}
        onSubmit={calculate}
        className="grid gap-5 xl:grid-cols-[1fr_360px]"
      >
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Pig and whole weights</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Pig">
                <Select
                  value={pigId}
                  onValueChange={(value) => {
                    setPigId(value);
                    setDraft(undefined);
                    quote.reset();
                  }}
                  required
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select active pig" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePigs.map((pig) => (
                      <SelectItem key={pig._id} value={pig._id}>
                        {pig.pigCode} · {formatPeso(pig.accumulatedCostCached)} cost
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Slaughter date">
                <Input
                  name="slaughterDate"
                  type="date"
                  defaultValue={
                    editing?.slaughterDate.slice(0, 10) ?? format(new Date(), "yyyy-MM-dd")
                  }
                  required
                />
              </Field>
              <Field label="Accumulated pig cost">
                <Input value={Number(selectedPig?.accumulatedCostCached ?? 0)} readOnly />
              </Field>
              <Field label="Live weight (kg)">
                <Input
                  name="liveWeightKg"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue={
                    editing
                      ? Number(editing.liveWeightKg)
                      : Number(selectedPig?.latestWeightKgCached ?? 0) || undefined
                  }
                  required
                />
              </Field>
              <Field label="Whole carcass (kg)">
                <Input
                  name="carcassWeightKg"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue={editing ? Number(editing.wholeCarcassWeightKg) : undefined}
                  required
                />
              </Field>
              <Field label="Amount paid now">
                <Input
                  name="amountPaid"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(editingExpense?.amountPaidCached ?? 0)}
                />
              </Field>
              <Field label="Paid from">
                <Select name="accountId" defaultValue={editingExpense?.paymentAccountIdCached}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select if paid" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.data?.items.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes">
                <Input name="notes" defaultValue={editing?.notes} />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Slaughter costs</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {costs.map((cost, index) => (
                <Field key={cost.name} label={cost.name}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.amount}
                    onChange={(event) =>
                      setCosts(
                        costs.map((item, i) =>
                          i === index ? { ...item, amount: Number(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Meat parts, weights, and prices per kg</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {parts.map((part, index) => (
                <div
                  key={part.name}
                  className="grid items-end gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-[1fr_120px_140px_140px]"
                >
                  <div>
                    <p className="text-sm font-semibold">{part.name}</p>
                    <p className="text-xs text-stone-400">{part.classification}</p>
                  </div>
                  <Field label="Weight kg">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={part.weightKg}
                      onChange={(event) =>
                        setParts(
                          parts.map((item, i) =>
                            i === index ? { ...item, weightKg: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Sell / kg">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.externalPricePerKg}
                      onChange={(event) =>
                        setParts(
                          parts.map((item, i) =>
                            i === index
                              ? { ...item, externalPricePerKg: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Karenderiya / kg">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.karenderiyaTransferPricePerKg}
                      onChange={(event) =>
                        setParts(
                          parts.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  karenderiyaTransferPricePerKg: Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <aside>
          <Card className="sticky top-24 overflow-hidden">
            <div className="bg-berry-950 p-5 text-white">
              <p className="text-xs uppercase tracking-[.15em] text-pink-200/70">
                True production cost
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {formatPeso(quote.data?.costPerUsableKg)}
                <span className="text-sm font-normal text-pink-200/70"> / usable kg</span>
              </p>
            </div>
            <CardContent className="space-y-3 pt-5">
              <Result label="Usable meat" value={`${quote.data?.usableWeightKg ?? "0"} kg`} />
              <Result
                label="Dressing percentage"
                value={`${quote.data?.dressingPercentage ?? "0"}%`}
              />
              <Result label="Usable yield" value={`${quote.data?.usableYieldPercentage ?? "0"}%`} />
              <Result
                label="Unaccounted weight"
                value={`${quote.data?.unaccountedWeightKg ?? "0"} kg`}
              />
              <Result label="Slaughter cost" value={formatPeso(quote.data?.slaughterCost)} />
              <Result label="Total pig cost" value={formatPeso(quote.data?.totalCost)} strong />
              <Result label="Expected revenue" value={formatPeso(quote.data?.expectedRevenue)} />
              <Result
                label="Estimated profit"
                value={formatPeso(quote.data?.estimatedProfit)}
                strong
              />
              <Button
                className="mt-3 w-full"
                type="submit"
                variant={quote.data ? "outline" : "default"}
                disabled={quote.isPending}
              >
                <Icon icon="solar:calculator-linear" />
                {quote.isPending ? "Calculating…" : "Calculate yield"}
              </Button>
              {quote.data && draft && (
                <Button
                  type="button"
                  className="w-full"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate(draft)}
                >
                  <Icon icon="solar:check-circle-linear" />
                  {complete.isPending
                    ? "Posting…"
                    : editing
                      ? "Save slaughter correction"
                      : "Complete slaughter"}
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Completed slaughter records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="py-3">Date</th>
                <th>Reference</th>
                <th>Pig</th>
                <th>Live kg</th>
                <th>Carcass kg</th>
                <th>Usable kg</th>
                <th>Yield</th>
                <th>Cost / kg</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.data?.items.map((record) => (
                <tr key={record._id}>
                  <td className="py-4">{format(new Date(record.slaughterDate), "MMM d, yyyy")}</td>
                  <td>{record.slaughterNumber}</td>
                  <td>
                    {pigs.data?.items.find((pig) => pig._id === record.pigId)?.pigCode ?? "Pig"}
                  </td>
                  <td>{number.format(Number(record.liveWeightKg))}</td>
                  <td>{number.format(Number(record.wholeCarcassWeightKg))}</td>
                  <td>{number.format(Number(record.usablePartsWeightKg))}</td>
                  <td>{record.usableYieldPercentage}%</td>
                  <td>{formatPeso(record.averageUsableMeatCostPerKg)}</td>
                  <td>
                    <Badge tone="green">{record.status}</Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(record)}>
                        <Icon icon="solar:pen-linear" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${record.slaughterNumber}? The produced stock, slaughter expense, cash payment, and pig status will be reversed.`,
                            )
                          )
                            remove.mutate({ id: record._id, force: false });
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
          {!records.data?.items.length && (
            <p className="py-10 text-center text-sm text-stone-400">
              No completed slaughter records yet.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(missingExpenseRecord)}
        onOpenChange={(open) => !open && setMissingExpenseRecord(undefined)}
      >
        <DialogContent>
          <DialogTitle>Delete without the missing expense?</DialogTitle>
          <DialogDescription>
            The expense linked to {missingExpenseRecord?.slaughterNumber} no longer exists.
            Continuing will delete the slaughter record and produced stock, restore the pig, and
            reverse any remaining linked cash transaction that can still be found.
          </DialogDescription>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This cannot restore or delete an expense record that is already missing.
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMissingExpenseRecord(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                missingExpenseRecord && remove.mutate({ id: missingExpenseRecord._id, force: true })
              }
            >
              {remove.isPending ? "Deleting…" : "Delete anyway"}
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
function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between border-b border-stone-100 pb-3 text-sm ${strong ? "font-bold" : ""}`}
    >
      <span className="text-stone-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
