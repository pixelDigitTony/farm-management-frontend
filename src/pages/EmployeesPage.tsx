import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { api, sessionUserStore } from "@/api/client";
import { Header } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { effectivePermissions, permissionModules } from "@/lib/permissions";

type Role = { level: number; name: string; permissions?: string[] };
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
      client.invalidateQueries({ queryKey: ["session-user"] });
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
      <Tabs defaultValue="employees">
        <TabsList aria-label="Employee management sections">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-5 space-y-5">
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
                    pending={mutate.isPending}
                    onMutate={(input) => mutate.mutate(input)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="roles" className="mt-5 space-y-5">
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
                    },
                  });
                }}
              >
                <Field label="Numeric level (0–97)">
                  <Input
                    aria-label="Numeric level"
                    name="level"
                    type="number"
                    min="0"
                    max="97"
                    required
                  />
                </Field>
                <Field label="Role name">
                  <Input
                    aria-label="Role name"
                    name="name"
                    placeholder="Manager"
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </Field>
                <p className="text-sm text-stone-500">
                  All new roles start with every permission unchecked and no module access. Open
                  Permissions after creating a role to grant access. The owner moves above new roles
                  automatically; 98 is reserved for the owner and 99 for Super Admin.
                </p>
                <Button disabled={mutate.isPending}>Create role</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="overflow-x-auto p-5">
            <h2 className="font-display text-xl font-semibold">Business roles</h2>
            <p className="mt-1 text-sm text-stone-500">
              Edit role names here. Role level changes also update assigned accounts and
              registration links. Use Permissions to control module access. Reassign accounts and
              registration links before deleting a role.
            </p>
            <table className="mt-4 w-full min-w-[560px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-3">Level</th>
                  <th>Role name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roleOptions.map((role) => (
                  <RoleRow
                    key={`${role.level}-${role.name}-${JSON.stringify(role.permissions)}`}
                    role={role}
                    highest={role.level === data.business.ownerRole}
                    ownerMinimum={
                      Math.max(
                        -1,
                        ...roleOptions
                          .filter((item) => item.level !== data.business.ownerRole)
                          .map((item) => item.level),
                      ) + 1
                    }
                    inUse={
                      data.users.some((user) => user.role === role.level) ||
                      data.invites.some((invite) => invite.role === role.level)
                    }
                    pending={mutate.isPending}
                    onMutate={(input) => mutate.mutateAsync(input)}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InviteCard({
  invite,
  roles,
  onMutate,
  pending,
}: {
  pending: boolean;
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
      <fieldset disabled={pending} className="mt-3 flex flex-wrap gap-2">
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
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            if (
              window.confirm(
                "Delete this registration link? It will stop accepting registrations. Existing accounts will remain.",
              )
            )
              onMutate({ path: `/invites/${invite._id}`, method: "DELETE" });
          }}
        >
          Delete
        </Button>
      </fieldset>
    </div>
  );
}

function RoleRow({
  ownerMinimum,
  role,
  highest,
  inUse,
  pending,
  onMutate,
}: {
  role: Role;
  ownerMinimum: number;
  highest: boolean;
  inUse: boolean;
  pending: boolean;
  onMutate: (input: { path: string; method?: string; payload?: unknown }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [name, setName] = useState(role.name);
  const [level, setLevel] = useState(String(role.level));
  const validLevel =
    Number.isInteger(Number(level)) &&
    level !== "" &&
    (highest
      ? Number(level) === role.level || Number(level) === ownerMinimum
      : Number(level) >= 0 && Number(level) <= 97);
  return (
    <tr>
      <td className="py-4">
        {editing ? (
          <>
            <Input
              aria-label={`Numeric level for ${role.name}`}
              className="w-24"
              type="number"
              min={highest ? ownerMinimum : 0}
              max={highest ? ownerMinimum : 97}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            />
            {highest && (
              <p className="mt-1 max-w-40 text-xs text-stone-500">
                To change the owner level, use {ownerMinimum}, one above the next highest role.
              </p>
            )}
          </>
        ) : (
          role.level
        )}
        {highest && <span className="ml-2 text-xs text-stone-500">Highest</span>}
      </td>
      <td className="py-4 pr-4">
        {editing ? (
          <Input
            aria-label={`Role name for level ${role.level}`}
            value={name}
            minLength={2}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        ) : (
          role.name
        )}
      </td>
      <td className="py-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setPermissionsOpen(true)}
          >
            Permissions
          </Button>
          <RolePermissionsDialog
            role={role}
            highest={highest}
            open={permissionsOpen}
            onOpenChange={setPermissionsOpen}
            pending={pending}
            onMutate={onMutate}
          />
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={pending || name.trim().length < 2 || !validLevel}
                onClick={async () => {
                  try {
                    await onMutate({
                      path: `/roles/${role.level}`,
                      method: "PATCH",
                      payload: {
                        name: name.trim(),
                        ...(Number(level) !== role.level ? { level: Number(level) } : {}),
                      },
                    });
                    setEditing(false);
                  } catch {
                    /* Mutation reports the error. */
                  }
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setName(role.name);
                  setLevel(String(role.level));
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || highest || inUse}
            title={
              highest
                ? "The highest business role cannot be deleted"
                : inUse
                  ? "Reassign accounts and registration links first"
                  : `Delete ${role.name}`
            }
            onClick={() => {
              if (window.confirm(`Delete role “${role.name}”?`))
                void onMutate({ path: `/roles/${role.level}`, method: "DELETE" }).catch(() => {});
            }}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RolePermissionsDialog({
  role,
  highest,
  open,
  onOpenChange,
  pending,
  onMutate,
}: {
  role: Role;
  highest: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onMutate: (input: { path: string; method?: string; payload?: unknown }) => Promise<unknown>;
}) {
  const saved = effectivePermissions(role, highest);
  const [permissions, setPermissions] = useState(saved);
  const toggle = (module: string, action: string, checked: boolean) => {
    setPermissions((current) => {
      const next = new Set(current);
      const key = `${module}:${action}`;
      if (checked) {
        next.add(key);
        next.add(`${module}:view`);
      } else {
        next.delete(key);
        if (action === "view")
          for (const value of next) if (value.startsWith(`${module}:`)) next.delete(value);
      }
      return [...next];
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setPermissions(saved);
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogTitle>Permissions · {role.name}</DialogTitle>
        <DialogDescription>
          {highest
            ? "The highest role has full access. Employee and role management are reserved for the highest role."
            : "Choose what this role can view and do. Actions require View access. Changes apply to all accounts assigned to this role."}
        </DialogDescription>
        {!highest && role.permissions === undefined && (
          <p className="mt-3 text-sm text-stone-500">
            This role currently uses its original access. Saving replaces that access with the
            selected permissions.
          </p>
        )}
        <p className="mt-3 text-sm text-stone-500">
          Some workflows need related modules: Cash flow for payment accounts, Inventory for
          ingredients and stock, Pigs for slaughter, and Menu for cooking. Overview and Reports
          include business-wide financial summaries.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[280px] text-left text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="py-3">Module</th>
                {["View", "Create", "Edit", "Delete"].map((action) => (
                  <th key={action} className="px-1 text-center sm:px-2">
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {permissionModules.map((module) => (
                <tr key={module.id}>
                  <td className="py-3 font-medium">{module.name}</td>
                  {(["view", "create", "edit", "delete"] as const).map((action) => (
                    <td key={action} className="px-1 text-center sm:px-2">
                      {(module.actions as readonly string[]).includes(action) ? (
                        <input
                          type="checkbox"
                          aria-label={`${module.name}: ${action}`}
                          checked={permissions.includes(`${module.id}:${action}`)}
                          disabled={highest || pending}
                          onChange={(event) => toggle(module.id, action, event.target.checked)}
                          className="size-4 accent-pink-700"
                        />
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setPermissions(saved);
              onOpenChange(false);
            }}
          >
            {highest ? "Close" : "Cancel"}
          </Button>
          {!highest && (
            <Button
              disabled={pending}
              onClick={async () => {
                try {
                  await onMutate({
                    path: `/roles/${role.level}/permissions`,
                    method: "PUT",
                    payload: { permissions },
                  });
                  onOpenChange(false);
                } catch {
                  /* Mutation reports the error. */
                }
              }}
            >
              Save permissions
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
