import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api, tokenStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/layout/AuthShell";

type LoginMethod = "EMAIL_PASSWORD" | "PHONE_MPIN";

export function AuthPage() {
  const [method, setMethod] = useState<LoginMethod>("EMAIL_PASSWORD");
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [recoveryKind, setRecoveryKind] = useState<"PASSWORD" | "MPIN">();
  const [requestingRecovery, setRequestingRecovery] = useState(false);
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

  async function requestRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recoveryKind) return;
    setRequestingRecovery(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ message: string }>("/auth/recovery/request", {
        method: "POST",
        body: JSON.stringify(
          recoveryKind === "PASSWORD"
            ? { kind: recoveryKind, email: form.identifier }
            : { kind: recoveryKind, phone: form.identifier },
        ),
      });
      toast.success(result.message);
      setRecoveryKind(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request a reset link");
    } finally {
      setRequestingRecovery(false);
    }
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
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-pink-700 hover:underline"
                  onClick={() => setRecoveryKind("PASSWORD")}
                >
                  Forgot password?
                </button>
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
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-pink-700 hover:underline"
                  onClick={() => setRecoveryKind("MPIN")}
                >
                  Forgot MPIN?
                </button>
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
      <Dialog
        open={Boolean(recoveryKind)}
        onOpenChange={(open) => !open && setRecoveryKind(undefined)}
      >
        <DialogContent>
          <DialogTitle>Reset your {recoveryKind === "MPIN" ? "MPIN" : "password"}</DialogTitle>
          <DialogDescription>
            {recoveryKind === "MPIN"
              ? "Enter your registered Philippine mobile number. The reset link will be sent to your verified email address."
              : "Enter your verified email address and we will send you a secure reset link."}
          </DialogDescription>
          <form className="mt-6 space-y-4" onSubmit={requestRecovery}>
            <div>
              <Label>
                {recoveryKind === "MPIN" ? "Philippine mobile number" : "Email address"}
              </Label>
              <Input
                name="identifier"
                type={recoveryKind === "MPIN" ? "tel" : "email"}
                inputMode={recoveryKind === "MPIN" ? "tel" : "email"}
                autoComplete={recoveryKind === "MPIN" ? "tel" : "email"}
                placeholder={recoveryKind === "MPIN" ? "0917 123 4567" : "owner@example.com"}
                required
              />
            </div>
            <Button className="w-full" disabled={requestingRecovery}>
              {requestingRecovery ? "Sending reset link…" : "Send reset link"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}
