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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export function PigsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pig>();
  const client = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pigs"],
    queryFn: () => resources.list<Pig>("pigs"),
  });
  const accounts = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<{ _id: string; name: string }>("cash-accounts", "?limit=100"),
  });
  const savePig = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editing) {
        await api("/operations/pig-acquisitions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return { weightRecorded: false };
      }

      const { latestWeightKgCached, ...pigDetails } = payload;
      const { purchaseCost, ...editablePigDetails } = pigDetails;
      await api(`/operations/pig-acquisitions/${editing._id}/cost`, {
        method: "PATCH",
        body: JSON.stringify({ purchaseCost }),
      });
      await resources.update("pigs", editing._id, editablePigDetails);
      const currentWeight =
        editing.latestWeightKgCached == null ? undefined : Number(editing.latestWeightKgCached);
      const nextWeight =
        latestWeightKgCached === undefined || latestWeightKgCached === ""
          ? undefined
          : Number(latestWeightKgCached);
      const weightRecorded = nextWeight !== undefined && nextWeight !== currentWeight;
      if (weightRecorded) {
        await api("/operations/pig-measurements", {
          method: "POST",
          body: JSON.stringify({
            measurementDate: format(new Date(), "yyyy-MM-dd"),
            pigId: editing._id,
            weightKg: nextWeight,
            notes: "Updated from pig record",
          }),
        });
      }
      return { weightRecorded };
    },
    onSuccess: ({ weightRecorded }) => {
      client.invalidateQueries({ queryKey: ["pigs"] });
      client.invalidateQueries({ queryKey: ["pig-measurements"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["expenses"] });
      client.invalidateQueries({ queryKey: ["cash-accounts"] });
      setOpen(false);
      setEditing(undefined);
      toast.success(
        editing ? (weightRecorded ? "Pig and weight updated" : "Pig updated") : "Pig added",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/operations/pig-acquisitions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["pigs"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["expenses"] });
      client.invalidateQueries({ queryKey: ["cash-accounts"] });
      toast.success("Pig purchase deleted and its expense and cash effects reversed");
    },
    onError: (error) => toast.error(error.message),
  });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    savePig.mutate(
      editing
        ? {
            pigCode: data.pigCode,
            earTag: data.earTag || undefined,
            sex: data.sex,
            breed: data.breed || undefined,
            currentPen: data.currentPen || undefined,
            acquisitionDate: data.acquisitionDate,
            purchaseCost: Number(data.purchaseCost),
            latestWeightKgCached: data.latestWeightKgCached
              ? Number(data.latestWeightKgCached)
              : undefined,
          }
        : {
            pigCode: data.pigCode,
            earTag: data.earTag || undefined,
            sex: data.sex,
            breed: data.breed || undefined,
            currentPen: data.currentPen || undefined,
            acquisitionDate: data.acquisitionDate,
            purchaseCost: Number(data.purchaseCost),
            latestWeightKgCached: data.latestWeightKgCached
              ? Number(data.latestWeightKgCached)
              : undefined,
            amountPaid: Number(data.amountPaid),
            accountId: data.accountId || undefined,
          },
    );
  }
  function deletePig(pig: Pig) {
    if (
      window.confirm(
        `Delete ${pig.pigCode}? Its purchase expense and cash effect will also be reversed. This is only allowed before any operational history exists.`,
      )
    )
      remove.mutate(pig._id);
  }
  if (isLoading || accounts.isLoading) return <PageSkeleton cards={6} />;
  if (isError) return <QueryError message={error.message} retry={() => refetch()} />;
  return (
    <div className="space-y-6">
      <Header
        title="Pig records"
        description="Track each pig’s weight, status, and accumulated cost."
      >
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditing(undefined);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(undefined)}>
              <Icon icon="solar:add-circle-linear" />
              Add pig
            </Button>
          </DialogTrigger>
          <DialogContent key={editing?._id ?? "new"}>
            <DialogTitle>{editing ? "Edit pig" : "Add a pig"}</DialogTitle>
            <DialogDescription>
              Enter the core details used for costing and inventory.
            </DialogDescription>
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <Field label="Pig code">
                <Input
                  name="pigCode"
                  defaultValue={editing?.pigCode}
                  required
                  placeholder="PIG-031"
                />
              </Field>
              <Field label="Ear tag">
                <Input name="earTag" defaultValue={editing?.earTag} placeholder="Optional" />
              </Field>
              <Field label="Sex">
                <Select name="sex" defaultValue={editing?.sex ?? "UNKNOWN"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="UNKNOWN">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Breed">
                <Input name="breed" defaultValue={editing?.breed} />
              </Field>
              <Field label="Current pen">
                <Input name="currentPen" defaultValue={editing?.currentPen} placeholder="Pen A" />
              </Field>
              <Field label="Acquisition date">
                <Input
                  name="acquisitionDate"
                  type="date"
                  defaultValue={
                    editing?.acquisitionDate?.slice(0, 10) ?? format(new Date(), "yyyy-MM-dd")
                  }
                  required
                />
              </Field>
              <Field label="Purchase cost">
                <Input
                  name="purchaseCost"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(editing?.purchaseCost ?? 0)}
                  required
                />
              </Field>
              <Field label="Current weight (kg)">
                <Input
                  name="latestWeightKgCached"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={
                    editing?.latestWeightKgCached == null
                      ? ""
                      : Number(editing.latestWeightKgCached)
                  }
                />
              </Field>
              {!editing && (
                <>
                  <Field label="Amount paid now">
                    <Input name="amountPaid" type="number" min="0" step="0.01" defaultValue="0" />
                  </Field>
                  <Field label="Paid from">
                    <Select name="accountId">
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
                </>
              )}
              {editing && (
                <p className="self-end pb-2 text-xs text-stone-500">
                  A changed weight is recorded as a new measurement dated today. Purchase cost also
                  updates the linked purchase expense and accumulated cost.
                </p>
              )}
              <Button className="sm:col-span-2" disabled={savePig.isPending}>
                {editing ? "Update pig" : "Save pig"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </Header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((pig) => (
          <Card key={pig._id} className="overflow-hidden">
            <div className="flex items-start justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl border border-pink-200 bg-white text-pink-600 shadow-[inset_0_-8px_16px_rgba(251,207,232,.5)]">
                  <Icon icon="mdi:pig-variant" className="size-7" />
                </div>
                <div>
                  <p className="font-display text-xl font-semibold">{pig.pigCode}</p>
                  <p className="text-xs text-stone-400">
                    {pig.earTag || "No ear tag"} · {pig.sex}
                  </p>
                </div>
              </div>
              <Badge tone={pig.status === "ACTIVE" ? "green" : "neutral"}>{pig.status}</Badge>
            </div>
            <div className="grid grid-cols-3 divide-x divide-pink-100 border-t border-pink-100 bg-pink-50/60 text-center">
              <SmallMetric
                label="Weight"
                value={
                  pig.latestWeightKgCached
                    ? `${number.format(Number(pig.latestWeightKgCached))} kg`
                    : "—"
                }
              />
              <SmallMetric label="Pen" value={pig.currentPen || "—"} />
              <SmallMetric label="Cost" value={formatPeso(pig.accumulatedCostCached)} />
            </div>
            <div className="flex gap-2 border-t border-pink-100 p-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setEditing(pig);
                  setOpen(true);
                }}
              >
                <Icon icon="solar:pen-linear" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                disabled={remove.isPending}
                onClick={() => deletePig(pig)}
              >
                <Icon icon="solar:trash-bin-trash-linear" /> Delete
              </Button>
            </div>
          </Card>
        ))}
        {!data?.items.length && (
          <Card className="col-span-full grid min-h-56 place-items-center border-dashed">
            <div className="text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-pink-50 text-pink-300">
                <Icon icon="mdi:pig-variant-outline" className="size-10" />
              </div>
              <p className="mt-3 font-semibold">No pigs recorded yet</p>
              <p className="mt-1 text-sm text-stone-400">
                Add the first pig to start tracking costs.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-stone-500">{description}</p>
      </div>
      {children}
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
function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 py-3">
      <p className="truncate text-sm font-bold">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  );
}
