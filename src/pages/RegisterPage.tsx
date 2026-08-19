import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/layout/AuthShell";

type RegistrationResult = {
  message: string;
  email: string;
  emailDelivery: { status: string; developmentVerificationUrl?: string };
};

export function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) return toast.error("Passwords do not match");
    if (values.mpin !== values.confirmMpin) return toast.error("MPIN entries do not match");
    setLoading(true);
    try {
      const response = await api<RegistrationResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ownerName: values.ownerName,
          businessName: values.businessName,
          email: values.email,
          phone: values.phone,
          password: values.password,
          mpin: values.mpin,
          openingBalance: Number(values.openingBalance),
        }),
      });
      setResult(response);
      toast.success("Owner registration completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration could not be completed");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!result) return;
    const request = api<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: result.email }),
    });
    toast.promise(request, {
      loading: "Sending verification email…",
      success: (value) => value.message,
      error: (error) => (error instanceof Error ? error.message : "Email could not be sent"),
    });
  }

  if (result)
    return (
      <AuthShell>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <Icon icon="solar:letter-opened-bold-duotone" className="size-9" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            We sent an activation link to <strong className="text-stone-800">{result.email}</strong>
            . Verify it before using either login method.
          </p>
          {result.emailDelivery.status === "FAILED" && (
            <Card className="mt-5 border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
              <p className="font-semibold">The first email could not be sent.</p>
              <p className="mt-1">
                Check the Resend configuration, then request another email.
              </p>
            </Card>
          )}
          {result.emailDelivery.developmentVerificationUrl && (
            <a
              className="mt-5 block rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800"
              href={result.emailDelivery.developmentVerificationUrl}
            >
              Open development verification link
            </a>
          )}
          <Button className="mt-6 w-full" variant="outline" onClick={resend}>
            Resend verification email
          </Button>
          <Button className="mt-3 w-full" asChild>
            <Link to="/login">Return to sign in</Link>
          </Button>
        </motion.div>
      </AuthShell>
    );

  return (
    <AuthShell width="max-w-xl">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-pink-700">
        Owner registration
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
        Create Miss V Business
      </h1>
      <p className="mt-3 text-sm text-stone-500">
        This application supports one owner account. Your email must be verified before login.
      </p>
      <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <Field label="Owner name">
          <Input name="ownerName" autoComplete="name" required />
        </Field>
        <Field label="Business name">
          <Input name="businessName" defaultValue="Miss V Business" required />
        </Field>
        <div className="sm:col-span-2">
          <Label>Email address</Label>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="owner@example.com"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Philippine mobile number</Label>
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="0917 123 4567"
          />
        </div>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm password">
          <Input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="6-digit MPIN">
          <Input
            name="mpin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="tracking-[.4em]"
          />
        </Field>
        <Field label="Confirm MPIN">
          <Input
            name="confirmMpin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="tracking-[.4em]"
          />
        </Field>
        <div className="sm:col-span-2">
          <Label>Opening cash balance</Label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-sm text-stone-400">₱</span>
            <Input
              name="openingBalance"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className="pl-8"
            />
          </div>
        </div>
        <p className="sm:col-span-2 text-xs leading-relaxed text-stone-400">
          Choose a private six-digit MPIN. Repeated digits and simple sequences such as 123456 are
          rejected.
        </p>
        <Button className="sm:col-span-2" size="lg" disabled={loading}>
          {loading ? "Creating account…" : "Register owner account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-pink-700 hover:underline">
          Sign in
        </Link>
      </p>
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
