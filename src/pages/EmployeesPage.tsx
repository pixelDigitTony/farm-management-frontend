import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { api, sessionUserStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Header } from "./PigsPage";

type Role = { level: number; name: string };
type Employee = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: number;
  status: string;
};
type Invite = {
  _id: string;
  tokenId: string;
  role: number;
  expiresAt?: string | null;
  isActive: boolean;
  registrationCount: number;
};
type EmployeeData = {
  users: Employee[];
  business: { businessName: string; ownerRole: number; roles: Role[] };
  invites: Invite[];
};

export function EmployeesPage() {
  const client = useQueryClient();
  const session = sessionUserStore.get();
  const query = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<EmployeeData>("/employees"),
    enabled: Boolean(session?.isHighestRole),
  });
  const mutate = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      payload,
    }: {
      path: string;
      method?: string;
      payload?: unknown;
    }) => api(`/employees${path}`, { method, body: payload ? JSON.stringify(payload) : undefined }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee settings updated");
    },
    onError: (error) => toast.error(error.message),
  });
  if (!session?.isHighestRole) return <p>Only the highest business role can manage employees.</p>;
  const data = query.data;
  if (!data) return <p className="text-sm text-stone-500">Loading employee management…</p>;
  const roleOptions = [...data.business.roles].sort((a, b) => b.level - a.level);
  return (
    <div className="space-y-6">
      <Header
        title="Employee management"
        description="Create business accounts, named roles, and private registration links."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create named role</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const f = Object.fromEntries(new FormData(event.currentTarget));
                mutate.mutate({
                  path: "/roles",
                  payload: {
                    level: Number(f.level),
                    name: f.name,
                    previousOwnerRoleName: f.previousOwnerRoleName || undefined,
                  },
                });
              }}
            >
              <Field label="Numeric level (0–98)">
                <Input name="level" type="number" min="0" max="98" required />
              </Field>
              <Field label="Role name">
                <Input name="name" placeholder="Manager" required />
              </Field>
              <Field
                label={`Name current owner level ${data.business.ownerRole} if creating a higher role`}
              >
                <Input name="previousOwnerRoleName" placeholder="Administrator" />
              </Field>
              <Button disabled={mutate.isPending}>Create role</Button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2">
              {roleOptions.map((role) => (
                <span key={role.level} className="rounded-full bg-pink-50 px-3 py-1 text-sm">
                  {role.level} · {role.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create employee account</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const f = Object.fromEntries(new FormData(event.currentTarget));
                mutate.mutate({
                  path: "/accounts",
                  payload: {
                    name: f.name,
                    email: f.email,
                    phone: f.phone,
                    password: f.password,
                    mpin: f.mpin,
                    role: Number(f.role),
                  },
                });
              }}
            >
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Role">
                <RoleSelect roles={roleOptions} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Phone">
                <Input name="phone" type="tel" required />
              </Field>
              <Field label="Temporary password">
                <Input name="password" type="password" minLength={8} required />
              </Field>
              <Field label="Temporary MPIN">
                <Input name="mpin" type="password" pattern="[0-9]{6}" maxLength={6} required />
              </Field>
              <Button className="sm:col-span-2" disabled={mutate.isPending}>
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card className="overflow-x-auto p-5">
        <h2 className="font-display text-xl font-semibold">Business users</h2>
        <table className="mt-4 w-full min-w-[720px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-stone-400">
            <tr>
              <th className="py-3">Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.users.map((user) => (
              <tr key={user._id}>
                <td className="py-4 font-semibold">{user.name}</td>
                <td>{user.email}</td>
                <td>{user.status}</td>
                <td>
                  <select
                    className="rounded-lg border p-2"
                    value={user.role}
                    onChange={(event) =>
                      mutate.mutate({
                        path: `/accounts/${user._id}`,
                        method: "PATCH",
                        payload: { role: Number(event.target.value) },
                      })
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role.level} value={role.level}>
                        {role.level} · {role.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registration links</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const f = Object.fromEntries(new FormData(event.currentTarget));
              mutate.mutate({
                path: "/invites",
                payload: {
                  role: Number(f.role),
                  expiresAt: f.expiresAt ? new Date(String(f.expiresAt)).toISOString() : null,
                  isActive: true,
                },
              });
            }}
          >
            <Field label="Assigned role">
              <RoleSelect roles={roleOptions} />
            </Field>
            <Field label="Expires (blank means never)">
              <Input name="expiresAt" type="datetime-local" />
            </Field>
            <Button disabled={mutate.isPending}>Generate link</Button>
          </form>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.invites.map((invite) => (
              <InviteCard
                key={invite._id}
                invite={invite}
                roles={roleOptions}
                onMutate={(input) => mutate.mutate(input)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteCard({
  invite,
  roles,
  onMutate,
}: {
  invite: Invite;
  roles: Role[];
  onMutate: (input: { path: string; method?: string; payload?: unknown }) => void;
}) {
  const [role, setRole] = useState(invite.role);
  const [expiresAt, setExpiresAt] = useState(
    invite.expiresAt ? new Date(invite.expiresAt).toISOString().slice(0, 16) : "",
  );
  const link = `${window.location.origin}/join/${invite.tokenId}`;
  const update = (isActive = invite.isActive) =>
    onMutate({
      path: `/invites/${invite._id}`,
      method: "PATCH",
      payload: {
        role,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive,
      },
    });
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex gap-4">
        <QRCodeSVG value={link} size={104} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Role {invite.role} · {invite.isActive ? "Active" : "Inactive"}
          </p>
          <p className="mt-1 truncate text-xs text-stone-500">{link}</p>
          <p className="mt-1 text-xs text-stone-400">
            {invite.expiresAt
              ? `Expires ${new Date(invite.expiresAt).toLocaleString()}`
              : "Never expires"}{" "}
            · {invite.registrationCount} registrations
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select
          aria-label="Assigned invite role"
          className="h-10 rounded-xl border px-3 text-sm"
          value={role}
          onChange={(event) => setRole(Number(event.target.value))}
        >
          {roles.map((item) => (
            <option key={item.level} value={item.level}>
              {item.level} · {item.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Invite expiry"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>
          Copy
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onMutate({ path: `/invites/${invite._id}/regenerate` })}
        >
          Regenerate
        </Button>
        <Button size="sm" variant="outline" onClick={() => update()}>
          Save role / expiry
        </Button>
        <Button size="sm" variant="outline" onClick={() => update(!invite.isActive)}>
          {invite.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
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
function RoleSelect({ roles }: { roles: Role[] }) {
  return (
    <select
      name="role"
      className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"
      required
    >
      {roles.map((role) => (
        <option key={role.level} value={role.level}>
          {role.level} · {role.name}
        </option>
      ))}
    </select>
  );
}
