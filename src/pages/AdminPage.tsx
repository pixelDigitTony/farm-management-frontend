import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, sessionUserStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Header } from "./PigsPage";

type Approval = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  businessName: string;
  status: string;
  emailVerifiedAt?: string;
};

export function AdminPage() {
  const client = useQueryClient();
  const user = sessionUserStore.get();
  const approvals = useQuery({
    queryKey: ["admin-approvals"],
    queryFn: () => api<{ items: Approval[] }>("/admin/approvals"),
    enabled: user?.role === 99,
  });
  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api(`/admin/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-approvals"] }),
  });
  if (user?.role !== 99) return <p>Super-admin access required.</p>;
  if (approvals.isLoading) return <PageSkeleton />;
  return (
    <div className="space-y-6">
      <Header title="Admin" description="Approve newly registered business accounts." />
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
              <tr key={item._id}>
                <td className="py-4 font-semibold">{item.businessName}</td>
                <td>{item.name}</td>
                <td>{item.email}</td>
                <td>{item.emailVerifiedAt ? "Verified" : "Pending email"}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide.mutate({ id: item._id, approved: true })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.confirm("Reject and disable this account?") &&
                        decide.mutate({ id: item._id, approved: false })
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
    </div>
  );
}
