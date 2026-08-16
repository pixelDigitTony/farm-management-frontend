import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { api } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPeso, number } from "@/lib/utils";
import { Header } from "./PigsPage";

type Group = {
  _id: string;
  total?: number;
  amount?: number;
  paid?: number;
  payable?: number;
  count: number;
};
type CashGroup = {
  _id: { businessUnit: string; transactionType: string };
  amount: number;
  count: number;
};
type PigCost = {
  _id: string;
  pigCode: string;
  status: string;
  latestWeightKgCached?: string;
  accumulatedCostCached: string;
};
type SlaughterYield = {
  _id: string;
  slaughterNumber: string;
  slaughterDate: string;
  liveWeightKg: string;
  wholeCarcassWeightKg: string;
  usablePartsWeightKg: string;
  dressingPercentage: string;
  usableYieldPercentage: string;
  averageUsableMeatCostPerKg: string;
};
type MenuPerformance = {
  _id: string;
  menuName: string;
  quantitySold: number;
  netSales: number;
  totalCost: number;
  grossProfit: number;
};
type PiggerySales = {
  _id: string;
  revenue: number;
  received: number;
  receivable: number;
  count: number;
};
type Inventory = {
  _id: string;
  name: string;
  businessUnit: string;
  category: string;
  baseUnit: string;
  currentStockCached: string;
  defaultExternalPricePerUnit?: string;
  defaultKarenderiyaTransferPricePerUnit?: string;
};
type ReportData = {
  cashByUnit: CashGroup[];
  expensesByUnit: Group[];
  expensesByCategory: Group[];
  pigCosts: PigCost[];
  slaughterYields: SlaughterYield[];
  menuPerformance: MenuPerformance[];
  piggerySales: PiggerySales[];
  inventory: Inventory[];
};

const dateInput = (date: Date) => format(date, "yyyy-MM-dd");

export function ReportsPage() {
  const [from, setFrom] = useState(dateInput(startOfMonth(new Date())));
  const [to, setTo] = useState(dateInput(new Date()));
  const report = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => api<ReportData>(`/reports?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  });
  if (report.isLoading) return <PageSkeleton />;
  if (report.isError)
    return <QueryError message={report.error.message} retry={() => report.refetch()} />;
  const data = report.data;
  if (!data) return null;
  const cashIn = data.cashByUnit
    .filter((item) => item._id.transactionType === "CASH_IN")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const cashOut = data.cashByUnit
    .filter((item) => item._id.transactionType === "CASH_OUT")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = data.expensesByUnit.reduce((sum, item) => sum + Number(item.total), 0);
  const piggeryRevenue = data.piggerySales.reduce((sum, item) => sum + Number(item.revenue), 0);
  const karenderiyaRevenue = data.menuPerformance.reduce(
    (sum, item) => sum + Number(item.netSales),
    0,
  );
  const karenderiyaProfit = data.menuPerformance.reduce(
    (sum, item) => sum + Number(item.grossProfit),
    0,
  );
  const inventoryValue = data.inventory.reduce(
    (sum, item) =>
      sum +
      Number(item.currentStockCached) *
        Number(
          item.defaultExternalPricePerUnit ?? item.defaultKarenderiyaTransferPricePerUnit ?? 0,
        ),
    0,
  );

  return (
    <div className="space-y-6">
      <Header
        title="Reports"
        description="Live reports calculated from posted cash, expenses, stock, pigs, slaughter, and karenderiya sales."
      />
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-[220px_220px_1fr]">
          <div>
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <p className="self-end pb-2 text-sm text-stone-500">
            Amounts are in Philippine pesos. Inventory is a current snapshot; other figures follow
            the selected period.
          </p>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Cash in" value={formatPeso(cashIn)} />
        <Metric label="Cash out" value={formatPeso(cashOut)} />
        <Metric
          label="Net cash flow"
          value={formatPeso(cashIn - cashOut)}
          green={cashIn >= cashOut}
        />
        <Metric label="Recorded expenses" value={formatPeso(expenses)} />
        <Metric label="Piggery revenue" value={formatPeso(piggeryRevenue)} />
        <Metric label="Karenderiya revenue" value={formatPeso(karenderiyaRevenue)} />
        <Metric
          label="Karenderiya gross profit"
          value={formatPeso(karenderiyaProfit)}
          green={karenderiyaProfit >= 0}
        />
        <Metric label="Current inventory value" value={formatPeso(inventoryValue)} />
      </div>
      <Tabs defaultValue="cash">
        <TabsList className="h-auto grid-cols-3 gap-1 lg:grid-cols-6">
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="pigs">Pig costs</TabsTrigger>
          <TabsTrigger value="slaughter">Slaughter</TabsTrigger>
          <TabsTrigger value="menu">Menu profit</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>
        <TabsContent value="cash" className="mt-5">
          <ReportTable
            title="Cash in and cash out"
            headers={["Business", "Movement", "Transactions", "Amount"]}
            empty="No cash movements in this period."
            rows={data.cashByUnit.map((item) => [
              item._id.businessUnit,
              item._id.transactionType.replaceAll("_", " "),
              number.format(item.count),
              formatPeso(item.amount),
            ])}
          />
        </TabsContent>
        <TabsContent value="expenses" className="mt-5 grid gap-5 xl:grid-cols-2">
          <ReportTable
            title="Expenses by business"
            headers={["Business", "Bills", "Paid", "Payable", "Total"]}
            empty="No expenses in this period."
            rows={data.expensesByUnit.map((item) => [
              item._id,
              number.format(item.count),
              formatPeso(item.paid),
              formatPeso(item.payable),
              formatPeso(item.total),
            ])}
          />
          <ReportTable
            title="Expenses by category"
            headers={["Category", "Bills", "Total"]}
            empty="No expense categories in this period."
            rows={data.expensesByCategory.map((item) => [
              item._id.replaceAll("_", " "),
              number.format(item.count),
              formatPeso(item.total),
            ])}
          />
        </TabsContent>
        <TabsContent value="pigs" className="mt-5">
          <ReportTable
            title="Cost per pig"
            headers={["Pig", "Status", "Latest weight", "Accumulated cost", "Cost / kg"]}
            empty="No pigs recorded."
            rows={data.pigCosts.map((pig) => [
              pig.pigCode,
              pig.status,
              pig.latestWeightKgCached
                ? `${number.format(Number(pig.latestWeightKgCached))} kg`
                : "—",
              formatPeso(pig.accumulatedCostCached),
              Number(pig.latestWeightKgCached) > 0
                ? formatPeso(Number(pig.accumulatedCostCached) / Number(pig.latestWeightKgCached))
                : "—",
            ])}
          />
        </TabsContent>
        <TabsContent value="slaughter" className="mt-5">
          <ReportTable
            title="Slaughter yield"
            headers={[
              "Date",
              "Reference",
              "Live kg",
              "Carcass kg",
              "Usable kg",
              "Dressing",
              "Yield",
              "Cost / usable kg",
            ]}
            empty="No completed slaughter records in this period."
            rows={data.slaughterYields.map((item) => [
              format(new Date(item.slaughterDate), "MMM d, yyyy"),
              item.slaughterNumber,
              number.format(Number(item.liveWeightKg)),
              number.format(Number(item.wholeCarcassWeightKg)),
              number.format(Number(item.usablePartsWeightKg)),
              `${item.dressingPercentage}%`,
              `${item.usableYieldPercentage}%`,
              formatPeso(item.averageUsableMeatCostPerKg),
            ])}
          />
        </TabsContent>
        <TabsContent value="menu" className="mt-5">
          <ReportTable
            title="Menu profitability"
            headers={["Menu", "Sold", "Sales", "Food cost", "Gross profit", "Margin"]}
            empty="No karenderiya sales in this period."
            rows={data.menuPerformance.map((item) => [
              item.menuName,
              number.format(Number(item.quantitySold)),
              formatPeso(item.netSales),
              formatPeso(item.totalCost),
              formatPeso(item.grossProfit),
              Number(item.netSales) > 0
                ? `${number.format((Number(item.grossProfit) / Number(item.netSales)) * 100)}%`
                : "—",
            ])}
          />
        </TabsContent>
        <TabsContent value="inventory" className="mt-5">
          <ReportTable
            title="Current inventory snapshot"
            headers={["Item", "Business", "Category", "Stock", "Reference unit cost", "Value"]}
            empty="No inventory items."
            rows={data.inventory.map((item) => {
              const unitCost = Number(
                item.defaultExternalPricePerUnit ??
                  item.defaultKarenderiyaTransferPricePerUnit ??
                  0,
              );
              return [
                item.name,
                item.businessUnit,
                item.category,
                `${number.format(Number(item.currentStockCached))} ${item.baseUnit}`,
                formatPeso(unitCost),
                formatPeso(Number(item.currentStockCached) * unitCost),
              ];
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold ${green ? "text-emerald-700" : ""}`}>
        {value}
      </p>
    </Card>
  );
}
function ReportTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
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
            {rows.map((row) => (
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
        {!rows.length && <p className="py-10 text-center text-sm text-stone-400">{empty}</p>}
      </CardContent>
    </Card>
  );
}
