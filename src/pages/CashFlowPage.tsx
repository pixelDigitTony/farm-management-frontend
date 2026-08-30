import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { api, resources } from "@/api/client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPeso } from "@/lib/utils";
import { Header } from "./PigsPage";

type Expense = {
  _id: string;
  expenseNumber: string;
  expenseDate: string;
  businessUnit: string;
  category: string;
  description: string;
  totalAmount: string;
  amountPaidCached: string;
  paymentAccountIdCached?: string;
  balanceDueCached: string;
  paymentStatus: string;
};
type CashAccount = {
  _id: string;
  accountCode: string;
  name: string;
  accountType: string;
  currentBalanceCached: string;
  isActive: boolean;
};
type CashTransaction = {
  _id: string;
  transactionNumber: string;
  transactionDate: string;
  businessUnit: string;
  transactionType: string;
  category: string;
  amount: string;
  description: string;
};

const EXPENSE_CATEGORIES = [
  "PIG_PURCHASE",
  "FEED",
  "MEDICINE",
  "VETERINARY",
  "SLAUGHTER",
  "TRANSPORT",
  "INGREDIENT",
  "FUEL",
  "UTILITIES",
  "PACKAGING",
  "REPAIR",
  "SUPPLY",
  "RENT",
  "LIABILITY",
  "OTHER",
];

function ExpenseCategorySelect({ defaultValue }: { defaultValue: string }) {
  const [selected, setSelected] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matchingCategories = EXPENSE_CATEGORIES.filter((category) =>
    category.replaceAll("_", " ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="relative">
      <input name="category" type="hidden" value={selected} />
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between rounded-xl border border-pink-100 bg-white px-3 text-left text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected.replaceAll("_", " ")}
        <Icon icon="solar:alt-arrow-down-linear" />
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-full rounded-xl border border-stone-200 bg-white p-2 shadow-xl">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search categories..."
            aria-label="Search expense categories"
            autoFocus
          />
          <div className="mt-2 max-h-56 overflow-y-auto" role="listbox" aria-label="Expense categories">
            {matchingCategories.length ? (
              matchingCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-pink-50 focus:bg-pink-50 focus:outline-none"
                  onClick={() => {
                    setSelected(category);
                    setOpen(false);
                    setQuery("");
                  }}
                  role="option"
                  aria-selected={category === selected}
                >
                  {category.replaceAll("_", " ")}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-stone-500">No matching categories.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CashFlowPage() {
  const [open, setOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editing, setEditing] = useState<Expense>();
  const client = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => resources.list<Expense>("expenses"),
  });
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => resources.list<CashAccount>("cash-accounts"),
  });
  const transactions = useQuery({
    queryKey: ["cash-transactions"],
    queryFn: () =>
      resources.list<CashTransaction>("cash-transactions", "?limit=100&sort=-transactionDate"),
  });
  const saveExpense = useMutation({
    mutationFn: (payload: unknown) =>
      api(editing ? `/operations/expenses/${editing._id}` : "/operations/expenses", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["expenses"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setEditing(undefined);
      toast.success(editing ? "Expense updated" : "Expense recorded");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/operations/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["expenses"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Expense deleted and its cash effect reversed");
    },
    onError: (error) => toast.error(error.message),
  });
  const postCash = useMutation({
    mutationFn: (payload: unknown) =>
      api("/operations/cash", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["cash-transactions"] });
      client.invalidateQueries({ queryKey: ["cash-accounts"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setCashOpen(false);
      toast.success("Cash movement posted");
    },
    onError: (error) => toast.error(error.message),
  });
  const createAccount = useMutation({
    mutationFn: (payload: unknown) => resources.create("cash-accounts", payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["cash-accounts"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setAccountOpen(false);
      toast.success("Cash account created");
    },
    onError: (error) => toast.error(error.message),
  });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = Object.fromEntries(new FormData(event.currentTarget));
    const amount = Number(d.totalAmount);
    saveExpense.mutate({
      ...d,
      totalAmount: amount,
      amountPaid: Number(d.amountPaid),
      accountId: d.accountId || undefined,
      expenseNumber: editing?.expenseNumber ?? `EXP-${Date.now().toString().slice(-7)}`,
    });
  }
  function deleteExpense(expense: Expense) {
    if (
      window.confirm(`Delete ${expense.expenseNumber}? Any linked cash payment will be reversed.`)
    )
      remove.mutate(expense._id);
  }
  if (isLoading || accountsLoading || transactions.isLoading) return <PageSkeleton />;
  if (isError) return <QueryError message={error.message} retry={() => refetch()} />;
  return (
    <div className="space-y-6">
      <Header
        title="Cash flow"
        description="Record bills separately from the cash payments that settle them."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCashOpen(true)}>
            <Icon icon="solar:transfer-horizontal-linear" /> Cash movement
          </Button>
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Icon icon="solar:add-circle-linear" />
            New expense
          </Button>
        </div>
      </Header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary
          label="Total expenses"
          value={data?.items.reduce((a, e) => a + Number(e.totalAmount), 0) ?? 0}
          icon="solar:bill-list-bold-duotone"
        />
        <Summary
          label="Still payable"
          value={data?.items.reduce((a, e) => a + Number(e.balanceDueCached), 0) ?? 0}
          icon="solar:hourglass-bold-duotone"
        />
        <Summary
          label="Recorded bills"
          value={data?.total ?? 0}
          icon="solar:document-add-bold-duotone"
          numberOnly
        />
      </div>
      <Tabs defaultValue="expenses">
        <TabsList className="h-auto grid-cols-3 gap-1">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="ledger">Cash ledger</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Expense ledger</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
                  <tr>
                    <th className="py-3">Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Business</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.items.map((expense) => (
                    <tr key={expense._id}>
                      <td className="py-4 text-stone-500">
                        {format(new Date(expense.expenseDate), "MMM d, yyyy")}
                      </td>
                      <td className="font-medium">{expense.expenseNumber}</td>
                      <td>
                        <p className="font-semibold">{expense.description}</p>
                        <p className="text-xs text-stone-400">{expense.category}</p>
                      </td>
                      <td>{expense.businessUnit}</td>
                      <td>
                        <Badge tone={expense.paymentStatus === "PAID" ? "green" : "amber"}>
                          {expense.paymentStatus}
                        </Badge>
                      </td>
                      <td className="text-right font-bold">{formatPeso(expense.totalAmount)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(expense);
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
                            onClick={() => deleteExpense(expense)}
                          >
                            <Icon icon="solar:trash-bin-trash-linear" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.items.length && (
                <p className="py-12 text-center text-sm text-stone-400">No expenses yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Cash ledger</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-stone-400">
                  <tr>
                    <th className="py-3">Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Business</th>
                    <th>Movement</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.data?.items.map((transaction) => (
                    <tr key={transaction._id}>
                      <td className="py-4">
                        {format(new Date(transaction.transactionDate), "MMM d, yyyy")}
                      </td>
                      <td>{transaction.transactionNumber}</td>
                      <td>
                        <p className="font-semibold">{transaction.description}</p>
                        <p className="text-xs text-stone-400">
                          {transaction.category.replaceAll("_", " ")}
                        </p>
                      </td>
                      <td>{transaction.businessUnit}</td>
                      <td>
                        <Badge
                          tone={
                            transaction.transactionType === "CASH_IN"
                              ? "green"
                              : transaction.transactionType === "CASH_OUT"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {transaction.transactionType.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="text-right font-bold">{formatPeso(transaction.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!transactions.data?.items.length && (
                <p className="py-12 text-center text-sm text-stone-400">No cash movements yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="accounts" className="mt-5 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAccountOpen(true)}>
              <Icon icon="solar:add-circle-linear" /> New account
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts?.items.map((account) => (
              <Card key={account._id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="grid size-11 place-items-center rounded-xl bg-pink-100 text-pink-700">
                    <Icon
                      icon={
                        account.accountType === "BANK"
                          ? "solar:bank-linear"
                          : account.accountType === "EWALLET"
                            ? "solar:smartphone-linear"
                            : "solar:wallet-linear"
                      }
                      className="size-6"
                    />
                  </div>
                  <Badge tone={account.isActive ? "green" : "neutral"}>{account.accountType}</Badge>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">{account.name}</h3>
                <p className="mt-1 text-xs text-stone-400">{account.accountCode}</p>
                <p className="mt-5 text-2xl font-bold">
                  {formatPeso(account.currentBalanceCached)}
                </p>
              </Card>
            ))}
          </div>
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
          <DialogTitle>{editing ? "Edit expense" : "Record an expense"}</DialogTitle>
          <DialogDescription>
            Record the bill and optionally pay it immediately from a cash account.
          </DialogDescription>
          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Input
                name="description"
                defaultValue={editing?.description}
                required
                placeholder="e.g. 5 sacks of grower feed"
              />
            </div>
            <div>
              <Label>Business</Label>
              <Select name="businessUnit" defaultValue={editing?.businessUnit ?? "PIGGERY"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIGGERY">Piggery</SelectItem>
                  <SelectItem value="KARENDERIYA">Karenderiya</SelectItem>
                  <SelectItem value="GENERAL">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <ExpenseCategorySelect defaultValue={editing?.category ?? "FEED"} />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                name="expenseDate"
                type="date"
                defaultValue={editing?.expenseDate.slice(0, 10) ?? format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>
            <div>
              <Label>Total amount</Label>
              <Input
                name="totalAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing ? Number(editing.totalAmount) : undefined}
                required
              />
            </div>
            <div>
              <Label>Amount paid now</Label>
              <Input
                name="amountPaid"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Number(editing?.amountPaidCached ?? 0)}
              />
            </div>
            <div>
              <Label>Paid from</Label>
              <Select name="accountId" defaultValue={editing?.paymentAccountIdCached}>
                <SelectTrigger>
                  <SelectValue placeholder="Select if paid" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="sm:col-span-2" disabled={saveExpense.isPending}>
              {editing ? "Update expense" : "Save expense"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent>
          <DialogTitle>Post cash movement</DialogTitle>
          <DialogDescription>
            Record owner capital, withdrawals, corrections, or transfers between accounts.
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const d = Object.fromEntries(new FormData(event.currentTarget));
              postCash.mutate({
                ...d,
                amount: Number(d.amount),
                accountId: d.accountId || undefined,
                fromAccountId: d.fromAccountId || undefined,
                toAccountId: d.toAccountId || undefined,
              });
            }}
          >
            <div>
              <Label>Date</Label>
              <Input
                name="transactionDate"
                type="date"
                defaultValue={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>
            <div>
              <Label>Business</Label>
              <Select name="businessUnit" defaultValue="GENERAL">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["PIGGERY", "KARENDERIYA", "GENERAL"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Movement</Label>
              <Select name="transactionType" defaultValue="CASH_IN">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["CASH_IN", "CASH_OUT", "TRANSFER", "ADJUSTMENT"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select name="category" defaultValue="OWNER_CAPITAL">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "SALE_COLLECTION",
                    "EXPENSE_PAYMENT",
                    "OWNER_CAPITAL",
                    "OWNER_WITHDRAWAL",
                    "ACCOUNT_TRANSFER",
                    "REFUND",
                    "DEBIT",
                    "OTHER",
                  ].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account (cash in/out)</Label>
              <Select name="accountId">
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input name="amount" type="number" min="0.01" step="0.01" required />
            </div>
            <div>
              <Label>Transfer from</Label>
              <Select name="fromAccountId">
                <SelectTrigger>
                  <SelectValue placeholder="For transfers only" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transfer to</Label>
              <Select name="toAccountId">
                <SelectTrigger>
                  <SelectValue placeholder="For transfers only" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Input name="description" required placeholder="Reason for this movement" />
            </div>
            <Button className="sm:col-span-2" disabled={postCash.isPending}>
              Post movement
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <DialogTitle>Create cash account</DialogTitle>
          <DialogDescription>
            Add cash on hand, a bank account, or an e-wallet. Opening balance becomes its starting
            balance.
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const d = Object.fromEntries(new FormData(event.currentTarget));
              const opening = Number(d.openingBalance);
              createAccount.mutate({
                ...d,
                openingBalance: opening,
                currentBalanceCached: opening,
                isActive: true,
              });
            }}
          >
            <div>
              <Label>Account code</Label>
              <Input
                name="accountCode"
                defaultValue={`ACC-${Date.now().toString().slice(-6)}`}
                required
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input name="name" placeholder="Cash on hand" required />
            </div>
            <div>
              <Label>Account type</Label>
              <Select name="accountType" defaultValue="CASH">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["CASH", "BANK", "EWALLET"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Opening balance</Label>
              <Input
                name="openingBalance"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Provider (optional)</Label>
              <Input name="provider" placeholder="Bank or e-wallet name" />
            </div>
            <Button className="sm:col-span-2" disabled={createAccount.isPending}>
              Create account
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Summary({
  label,
  value,
  icon,
  numberOnly,
}: {
  label: string;
  value: number;
  icon: string;
  numberOnly?: boolean;
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="grid size-11 place-items-center rounded-xl bg-pink-100 text-pink-700">
        <Icon icon={icon} className="size-6" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">
          {numberOnly ? value : formatPeso(value)}
        </p>
      </div>
    </Card>
  );
}
