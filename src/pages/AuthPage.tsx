import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api, tokenStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/layout/AuthShell";

type LoginMethod = "EMAIL_PASSWORD" | "PHONE_MPIN";

export function AuthPage() {
  const [method, setMethod] = useState<LoginMethod>("EMAIL_PASSWORD");
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setUnverifiedEmail(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload =
      method === "EMAIL_PASSWORD"
        ? { method, email: form.email, password: form.password }
        : { method, phone: form.phone, mpin: form.mpin };
    try {
      const result = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      tokenStore.set(result.token);
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "EMAIL_NOT_VERIFIED" &&
        method === "EMAIL_PASSWORD"
      ) {
        setUnverifiedEmail(String(form.email));
      }
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!unverifiedEmail) return;
    const promise = api<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: unverifiedEmail }),
    });
    toast.promise(promise, {
      loading: "Requesting another verification email…",
      success: (result) => result.message,
      error: (error) => (error instanceof Error ? error.message : "Unable to resend email"),
    });
  }

  return (
    <AuthShell>
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-pink-700">Welcome back</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Owner sign in</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-500">
        Use your verified email and password, or your Philippine mobile number and MPIN.
      </p>
      <Tabs
        value={method}
        onValueChange={(value) => {
          setMethod(value as LoginMethod);
          setUnverifiedEmail(null);
        }}
        className="mt-7"
      >
        <TabsList>
          <TabsTrigger value="EMAIL_PASSWORD">Email</TabsTrigger>
          <TabsTrigger value="PHONE_MPIN">Phone + MPIN</TabsTrigger>
        </TabsList>
      </Tabs>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <AnimatePresence mode="wait" initial={false}>
          {method === "EMAIL_PASSWORD" ? (
            <motion.div
              key="email"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="space-y-4"
            >
              <div>
                <Label>Email address</Label>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="owner@example.com"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="space-y-4"
            >
              <div>
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
              <div>
                <Label>6-digit MPIN</Label>
                <Input
                  name="mpin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="current-password"
                  required
                  placeholder="••••••"
                  className="tracking-[.45em]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {unverifiedEmail && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <div className="flex gap-2">
              <Icon icon="solar:letter-unread-linear" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Email verification required</p>
                <button
                  type="button"
                  className="mt-1 font-semibold underline"
                  onClick={resendVerification}
                >
                  Resend verification email
                </button>
              </div>
            </div>
          </motion.div>
        )}
        <Button className="w-full" size="lg" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">
        First time here?{" "}
        <Link className="font-semibold text-pink-700 hover:underline" to="/register">
          Register the owner account
        </Link>
      </p>
    </AuthShell>
  );
}
