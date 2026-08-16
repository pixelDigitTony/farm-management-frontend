import { Icon } from "@iconify/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { MetricCard } from "@/components/MetricCard";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatPeso } from "@/lib/utils";
import type { Dashboard } from "@/types/domain";

const cash = (value: unknown) => formatPeso(value);
export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });
  if (isLoading) return <PageSkeleton />;
  if (isError) return <QueryError message={error.message} retry={() => refetch()} />;
  const m = data?.metrics;
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-pink-700">{format(new Date(), "EEEE, MMMM d")}</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Good day, Miss V.
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Here’s how your farm-to-table business is moving.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/cash-flow">
              <Icon icon="solar:add-circle-linear" />
              Record expense
            </Link>
          </Button>
          <Button asChild>
            <Link to="/karenderiya">
              <Icon icon="solar:bill-list-linear" />
              Record sales
            </Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Net cash flow"
          value={cash(m?.netCashFlow ?? 0)}
          detail={`${cash(m?.monthCashIn ?? 0)} in · ${cash(m?.monthCashOut ?? 0)} out`}
          icon="solar:wallet-money-bold-duotone"
          index={0}
        />
        <MetricCard
          label="Active pigs"
          value={String(m?.activePigs ?? 0)}
          detail={`${m?.slaughteredPigs ?? 0} slaughtered total`}
          icon="mdi:pig-variant"
          tone="amber"
          index={1}
        />
        <MetricCard
          label="Receivables"
          value={cash(m?.receivables ?? 0)}
          detail="Money buyers still owe"
          icon="solar:hand-money-bold-duotone"
          tone="blue"
          index={2}
        />
        <MetricCard
          label="Payables"
          value={cash(m?.payables ?? 0)}
          detail="Bills still to pay"
          icon="solar:bill-cross-bold-duotone"
          tone="red"
          index={3}
        />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Business performance</CardTitle>
              <CardDescription>This month, kept separate and combined.</CardDescription>
            </div>
            <Badge tone="green">Current month</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <BusinessPanel
                title="Piggery"
                icon="mdi:pig-variant-outline"
                revenue={m?.piggeryRevenue ?? 0}
                expenses={m?.piggeryExpenses ?? 0}
                profit={m?.piggeryProfit ?? 0}
              />
              <BusinessPanel
                title="Karenderiya"
                icon="solar:chef-hat-linear"
                revenue={m?.karenderiyaRevenue ?? 0}
                expenses={m?.karenderiyaExpenses ?? 0}
                profit={m?.karenderiyaProfit ?? 0}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash accounts</CardTitle>
            <CardDescription>Available money by account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.accounts.length ? (
              data.accounts.map((account) => (
                <div
                  key={account._id}
                  className="flex items-center justify-between rounded-xl bg-stone-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-lg bg-white text-pink-700 shadow-sm">
                      <Icon
                        icon={
                          account.accountType === "CASH"
                            ? "solar:wallet-linear"
                            : "solar:card-linear"
                        }
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{account.name}</p>
                      <p className="text-xs text-stone-400">{account.accountType}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold">{cash(account.currentBalanceCached)}</p>
                </div>
              ))
            ) : (
              <Empty text="Set up a cash account to begin." />
            )}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent cash activity</CardTitle>
            <CardDescription>Actual money received and paid.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-stone-100">
            {data?.recentTransactions.length ? (
              data.recentTransactions.map((tx) => (
                <div key={tx._id} className="flex items-center justify-between py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-semibold">{tx.description}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {format(new Date(tx.transactionDate), "MMM d, yyyy")} · {tx.businessUnit}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-bold ${tx.transactionType === "CASH_IN" ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {tx.transactionType === "CASH_IN" ? "+" : "−"}
                    {cash(tx.amount)}
                  </p>
                </div>
              ))
            ) : (
              <Empty text="No cash activity recorded yet." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Low stock watch</CardTitle>
            <CardDescription>Items at or below their reorder level.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.lowStock.length ? (
              data.lowStock.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-amber-700">Needs restocking</p>
                  </div>
                  <Badge tone="amber">
                    {Number(item.currentStockCached)} {item.baseUnit}
                  </Badge>
                </div>
              ))
            ) : (
              <Empty text="Stock levels look healthy." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
function BusinessPanel({
  title,
  icon,
  revenue,
  expenses,
  profit,
}: {
  title: string;
  icon: string;
  revenue: string | number;
  expenses: string | number;
  profit: string | number;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
      <div className="flex items-center gap-2">
        <Icon icon={icon} className="size-5 text-pink-700" />
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">Revenue</dt>
          <dd className="font-semibold">{cash(revenue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Expenses</dt>
          <dd className="font-semibold">{cash(expenses)}</dd>
        </div>
        <div className="border-t border-stone-200 pt-3 flex justify-between">
          <dt className="font-semibold">Gross profit</dt>
          <dd className="font-bold text-emerald-700">{cash(profit)}</dd>
        </div>
      </dl>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-stone-400">{text}</div>;
}
