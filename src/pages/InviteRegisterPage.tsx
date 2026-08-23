import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/layout/AuthShell";

export function InviteRegisterPage() {
  const { tokenId = "" } = useParams();
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const invite = useQuery({
    queryKey: ["invite", tokenId],
    queryFn: () => api<{ valid: boolean }>(`/invites/${tokenId}`),
    retry: false,
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget));
    if (f.password !== f.confirmPassword || f.mpin !== f.confirmMpin)
      return toast.error("Credential confirmations do not match");
    setLoading(true);
    try {
      await api(`/invites/${tokenId}/register`, {
        method: "POST",
        body: JSON.stringify({
          ownerName: f.name,
          email: f.email,
          phone: f.phone,
          password: f.password,
          mpin: f.mpin,
        }),
      });
      setComplete(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }
  if (invite.isLoading)
    return (
      <AuthShell>
        <p>Checking registration link…</p>
      </AuthShell>
    );
  if (!invite.data?.valid)
    return (
      <AuthShell>
        <h1 className="font-display text-3xl font-semibold">Link unavailable</h1>
        <p className="mt-3 text-stone-500">This registration link is inactive or expired.</p>
      </AuthShell>
    );
  if (complete)
    return (
      <AuthShell>
        <h1 className="font-display text-3xl font-semibold">Check your email</h1>
        <p className="mt-3 text-stone-500">
          Verify your email before signing in to the business account.
        </p>
        <Button className="mt-6 w-full" asChild>
          <Link to="/login">Return to sign in</Link>
        </Button>
      </AuthShell>
    );
  return (
    <AuthShell width="max-w-xl">
      <h1 className="font-display text-3xl font-semibold">Join business account</h1>
      <p className="mt-2 text-sm text-stone-500">
        Create your private credentials. The link does not expose business or role details.
      </p>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" minLength={8} required />
        </Field>
        <Field label="Confirm password">
          <Input name="confirmPassword" type="password" minLength={8} required />
        </Field>
        <Field label="6-digit MPIN">
          <Input name="mpin" type="password" pattern="[0-9]{6}" maxLength={6} required />
        </Field>
        <Field label="Confirm MPIN">
          <Input name="confirmMpin" type="password" pattern="[0-9]{6}" maxLength={6} required />
        </Field>
        <Button className="sm:col-span-2" disabled={loading}>
          {loading ? "Registering…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
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
