import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import type { CustomerOrder, CustomerOrderStatus } from "@/types/domain";
import { Header } from "./PigsPage";

const statuses: Array<"ALL" | CustomerOrderStatus> = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "ALL",
];
const nextStatus: Partial<Record<CustomerOrderStatus, CustomerOrderStatus>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "READY",
  READY: "COMPLETED",
};
const statusAction: Partial<Record<CustomerOrderStatus, string>> = {
  PENDING: "Confirm order",
  CONFIRMED: "Start processing",
  PROCESSING: "Mark ready",
  READY: "Complete order",
};

function statusTone(status: CustomerOrderStatus): "neutral" | "green" | "amber" | "red" {
  if (status === "COMPLETED" || status === "READY") return "green";
  if (status === "CANCELLED") return "red";
  if (status === "PENDING") return "amber";
  return "neutral";
}

export function OrdersPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState<"ALL" | CustomerOrderStatus>("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerOrder>();
  const [cancelling, setCancelling] = useState<CustomerOrder>();
  const [cancelReason, setCancelReason] = useState("");
  const query = new URLSearchParams({
    status,
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const orders = useQuery({
    queryKey: ["customer-orders", query.toString()],
    queryFn: () => api<{ items: CustomerOrder[]; pendingCount: number }>(`/orders?${query}`),
    refetchInterval: 30_000,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["customer-orders"] });
  const update = useMutation({
    mutationFn: ({
      order,
      next,
      cancellationReason = "",
    }: {
      order: CustomerOrder;
      next: CustomerOrderStatus;
      cancellationReason?: string;
    }) =>
      api<CustomerOrder>(`/orders/${order._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, cancellationReason }),
      }),
    onSuccess: (order) => {
      refresh();
      setSelected((current) => (current?._id === order._id ? order : current));
      setCancelling(undefined);
      setCancelReason("");
      toast.success(`Order marked ${order.status.toLowerCase().replaceAll("_", " ")}`);
    },
    onError: (error) => toast.error(error.message),
  });

  if (orders.isLoading) return <PageSkeleton cards={6} />;
  if (orders.isError)
    return <QueryError message={orders.error.message} retry={() => void orders.refetch()} />;

  return (
    <div className="space-y-6">
      <Header
        title="Customer Orders"
        description="Review orders submitted from your public landing page, starting with pending requests."
      >
        <Button
          variant="outline"
          onClick={() => void orders.refetch()}
          disabled={orders.isFetching}
        >
          <Icon icon="solar:refresh-linear" className={orders.isFetching ? "animate-spin" : ""} />{" "}
          Refresh
        </Button>
      </Header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Pending"
          value={orders.data?.pendingCount ?? 0}
          icon="solar:inbox-line-linear"
        />
        <Metric
          label="Showing"
          value={orders.data?.items.length ?? 0}
          icon="solar:clipboard-list-linear"
        />
        <Metric label="Auto refresh" value="30 sec" icon="solar:refresh-circle-linear" />
      </div>
      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div className="relative min-w-64 flex-1">
            <Icon icon="solar:magnifer-linear" className="absolute left-3 top-3.5 text-stone-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number, customer, or phone"
            />
          </div>
          <select
            className="h-11 rounded-xl border border-pink-100 bg-white px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>
      {(orders.data?.items ?? []).length ? (
        <div className="space-y-3">
          {orders.data?.items.map((order) => (
            <Card key={order._id} className="transition hover:border-pink-300">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold">{order.orderNumber}</h2>
                    <Badge tone={statusTone(order.status)}>
                      {order.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">{order.customer.name}</p>
                  <p className="text-sm text-stone-500">{order.customer.phone}</p>
                </div>
                <div>
                  <p className="font-bold text-pink-700">{formatPeso(order.total)}</p>
                  <p className="text-sm text-stone-500">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) ·{" "}
                    {order.fulfillmentMethod.toLowerCase()}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setSelected(order)}>
                  View order
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <Icon icon="solar:inbox-line-linear" className="mx-auto size-12 text-pink-300" />
          <h2 className="mt-4 font-display text-xl font-semibold">No matching orders</h2>
          <p className="mt-2 text-sm text-stone-500">
            New landing-page checkouts will appear here automatically.
          </p>
        </Card>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(undefined)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{selected?.orderNumber}</DialogTitle>
          <DialogDescription>
            {selected && format(new Date(selected.createdAt), "MMMM d, yyyy 'at' h:mm a")}
          </DialogDescription>
          {selected && <OrderDetails order={selected} />}
          {selected && nextStatus[selected.status] && (
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setCancelling(selected)}>
                Cancel order
              </Button>
              <Button
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    order: selected,
                    next: nextStatus[selected.status] as CustomerOrderStatus,
                  })
                }
              >
                {statusAction[selected.status]}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelling)}
        onOpenChange={(value) => !value && setCancelling(undefined)}
      >
        <DialogContent>
          <DialogTitle>Cancel {cancelling?.orderNumber}?</DialogTitle>
          <DialogDescription>
            Confirmed product quantities will be returned to the catalog.
          </DialogDescription>
          <div className="mt-5">
            <Label>Cancellation reason</Label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-pink-100 p-3 text-sm"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCancelling(undefined)}>
              Keep order
            </Button>
            <Button
              disabled={!cancelReason.trim() || update.isPending}
              onClick={() =>
                cancelling &&
                update.mutate({
                  order: cancelling,
                  next: "CANCELLED",
                  cancellationReason: cancelReason,
                })
              }
            >
              Cancel order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid size-11 place-items-center rounded-xl bg-pink-100 text-pink-700">
          <Icon icon={icon} className="size-6" />
        </div>
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDetails({ order }: { order: CustomerOrder }) {
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 rounded-2xl bg-pink-50/60 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-stone-500">Customer</p>
          <p className="mt-1 font-semibold">{order.customer.name}</p>
          <p className="text-sm">{order.customer.phone}</p>
          {order.customer.email && <p className="text-sm">{order.customer.email}</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-500">Fulfillment</p>
          <p className="mt-1 font-semibold">{order.fulfillmentMethod.replaceAll("_", " ")}</p>
          <p className="text-sm">{order.paymentMethod.replaceAll("_", " ")}</p>
          {order.deliveryAddress && <p className="mt-1 text-sm">{order.deliveryAddress}</p>}
        </div>
      </div>
      <div className="space-y-3">
        {order.items.map((item) => (
          <div
            key={`${item.sourceType}-${item.sourceId}-${item.variantId ?? ""}`}
            className="flex justify-between gap-4 border-b border-pink-100 pb-3"
          >
            <div>
              <p className="font-semibold">{item.nameSnapshot}</p>
              {item.variantSnapshot && (
                <p className="text-sm text-stone-500">{item.variantSnapshot}</p>
              )}
              <p className="text-sm text-stone-500">
                {item.quantity} × {formatPeso(item.unitPrice)}
              </p>
            </div>
            <p className="font-bold">{formatPeso(item.lineTotal)}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-lg font-bold">
        <span>Total</span>
        <span className="text-pink-700">{formatPeso(order.total)}</span>
      </div>
      {order.customerNotes && (
        <div>
          <p className="text-xs font-bold uppercase text-stone-500">Customer notes</p>
          <p className="mt-1 whitespace-pre-line text-sm">{order.customerNotes}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-bold uppercase text-stone-500">Status history</p>
        <div className="mt-2 space-y-2">
          {order.statusHistory.map((entry) => (
            <div
              key={`${entry.status}-${entry.changedAt}`}
              className="flex justify-between gap-4 text-sm"
            >
              <span>
                {entry.status.replaceAll("_", " ")}
                {entry.note ? ` · ${entry.note}` : ""}
              </span>
              <span className="text-stone-400">
                {format(new Date(entry.changedAt), "MMM d, h:mm a")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
