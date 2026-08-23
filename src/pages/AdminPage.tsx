import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, sessionUserStore } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "./PigsPage";

type AccountStatus =
  | "ACTIVE"
  | "ARCHIVED"
  | "DISABLED"
  | "LOCKED"
  | "PENDING_APPROVAL"
  | "PENDING_EMAIL"
  | "SUPER_ADMIN";

type OwnerAccount = {
  businessId: string;
  ownerId: string | null;
  businessName: string;
  name: string;
  email: string;
  phone: string;
  role: number;
  status: AccountStatus;
  accountStatus: string;
  emailVerified: boolean;
  isApproved: boolean;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
};

const statusLabels: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DISABLED: "Disabled",
  LOCKED: "Locked",
  PENDING_APPROVAL: "Pending approval",
  PENDING_EMAIL: "Pending email",
  SUPER_ADMIN: "Super admin",
};

function statusTone(status: AccountStatus): "neutral" | "green" | "amber" | "red" {
  if (status === "ACTIVE" || status === "SUPER_ADMIN") return "green";
  if (status === "PENDING_APPROVAL" || status === "PENDING_EMAIL") return "amber";
  if (status === "ARCHIVED" || status === "DISABLED" || status === "LOCKED") return "red";
  return "neutral";
}

function formatDate(value?: string | null) {
  return value ? format(new Date(value), "MMM d, yyyy") : "Never";
}

export function AdminPage() {
  const client = useQueryClient();
  const user = sessionUserStore.get();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const accounts = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => api<{ items: OwnerAccount[] }>("/admin/accounts"),
    enabled: user?.role === 99,
  });
  const approvals = useQuery({
    queryKey: ["admin-approvals"],
    queryFn: () => api<{ items: OwnerAccount[] }>("/admin/approvals"),
    enabled: user?.role === 99,
  });

  const refreshAccounts = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin-accounts"] }),
      client.invalidateQueries({ queryKey: ["admin-approvals"] }),
    ]);
  };
  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api<{ message: string }>(`/admin/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
      }),
    onSuccess: async (result) => {
      toast.success(result.message);
      await refreshAccounts();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Decision failed"),
  });
  const archive = useMutation({
    mutationFn: ({ businessId, archived }: { businessId: string; archived: boolean }) =>
      api<{ message: string }>(`/admin/accounts/${businessId}/archive`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      }),
    onSuccess: async (result) => {
      toast.success(result.message);
      await refreshAccounts();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });
  const remove = useMutation({
    mutationFn: ({ businessId, confirmation }: { businessId: string; confirmation: string }) =>
      api<void>(`/admin/accounts/${businessId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      }),
    onSuccess: async () => {
      toast.success("Business account and all of its data were permanently deleted");
      await refreshAccounts();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Permanent deletion failed"),
  });

  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (accounts.data?.items ?? []).filter((account) => {
      const matchesStatus = status === "ALL" || account.status === status;
      const matchesSearch =
        !term ||
        [account.businessName, account.name, account.email, account.phone].some((value) =>
          value.toLocaleLowerCase().includes(term),
        );
      return matchesStatus && matchesSearch;
    });
  }, [accounts.data?.items, search, status]);

  if (user?.role !== 99) return <p>Super-admin access required.</p>;
  if (accounts.isLoading || approvals.isLoading) return <PageSkeleton />;
  return (
    <div className="space-y-6">
      <Header
        title="Admin"
        description="Approve registrations and manage every owner business account."
      />
      <Tabs defaultValue="accounts">
        <TabsList className="max-w-md">
          <TabsTrigger value="accounts">
            Owner accounts ({accounts.data?.items.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals ({approvals.data?.items.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-5 space-y-4">
          <Card className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <Input
              type="search"
              placeholder="Search company, owner, email, or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
          <Card className="overflow-x-auto p-5">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-3">Company</th>
                  <th>Owner</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Last login</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAccounts.map((account) => {
                  const protectedAccount = account.status === "SUPER_ADMIN";
                  return (
                    <tr key={account.businessId}>
                      <td className="py-4 font-semibold">{account.businessName}</td>
                      <td>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs text-stone-400">Role {account.role}</p>
                      </td>
                      <td>
                        <p>{account.email || "—"}</p>
                        <p className="text-xs text-stone-400">{account.phone || "—"}</p>
                      </td>
                      <td>
                        <Badge tone={statusTone(account.status)}>
                          {statusLabels[account.status]}
                        </Badge>
                      </td>
                      <td>{formatDate(account.createdAt)}</td>
                      <td>{formatDate(account.lastLoginAt)}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {!protectedAccount && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={archive.isPending || remove.isPending}
                              onClick={() => {
                                if (account.isArchived) {
                                  archive.mutate({
                                    businessId: account.businessId,
                                    archived: false,
                                  });
                                  return;
                                }
                                if (
                                  window.confirm(
                                    `Archive ${account.businessName}? Everyone in this business will be signed out and blocked until restored.`,
                                  )
                                )
                                  archive.mutate({
                                    businessId: account.businessId,
                                    archived: true,
                                  });
                              }}
                            >
                              {account.isArchived ? "Restore" : "Archive"}
                            </Button>
                          )}
                          {!protectedAccount && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={archive.isPending || remove.isPending}
                              onClick={() => {
                                const confirmation = window.prompt(
                                  `Permanently delete ${account.businessName} and all of its data? This cannot be undone.\n\nType the exact company name to confirm:`,
                                );
                                if (confirmation !== null)
                                  remove.mutate({ businessId: account.businessId, confirmation });
                              }}
                            >
                              Delete permanently
                            </Button>
                          )}
                          {protectedAccount && (
                            <span className="text-xs text-stone-400">Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredAccounts.length && (
              <p className="py-10 text-center text-stone-400">
                No owner accounts match your search and filter.
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-5">
          <Card className="overflow-x-auto p-5">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-3">Company</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Verification</th>
                  <th className="text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {approvals.data?.items.map((item) => (
                  <tr key={item.ownerId}>
                    <td className="py-4 font-semibold">{item.businessName}</td>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.emailVerified ? "Verified" : "Pending email"}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={!item.ownerId || decide.isPending}
                          onClick={() =>
                            item.ownerId && decide.mutate({ id: item.ownerId, approved: true })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!item.ownerId || decide.isPending}
                          onClick={() =>
                            item.ownerId &&
                            window.confirm("Reject and disable this account?") &&
                            decide.mutate({ id: item.ownerId, approved: false })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!approvals.data?.items.length && (
              <p className="py-10 text-center text-stone-400">No accounts awaiting approval.</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
