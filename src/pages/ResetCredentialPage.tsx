import { Icon } from "@iconify/react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/layout/AuthShell";

export function ResetCredentialPage() {
  const [params] = useSearchParams();
  const kind = params.get("kind") === "mpin" ? "MPIN" : "PASSWORD";
  const token = params.get("token");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (!token) {
      setError("The reset token is missing.");
      return;
    }
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if (form.credential !== form.confirmCredential) {
      setError(`${kind === "MPIN" ? "MPINs" : "Passwords"} do not match.`);
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ message: string }>("/auth/recovery/reset", {
        method: "POST",
        body: JSON.stringify({ kind, token, credential: form.credential }),
      });
      setSuccess(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset credential");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {success ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <Icon icon="solar:verified-check-bold-duotone" className="size-9" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold">
            {kind === "MPIN" ? "MPIN reset" : "Password reset"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">{success}</p>
          <Button className="mt-7 w-full" asChild>
            <Link to="/login">Continue to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-pink-700">
            Account recovery
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
            Choose a new {kind === "MPIN" ? "MPIN" : "password"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            {kind === "MPIN"
              ? "Use exactly 6 digits and avoid repeated or sequential numbers."
              : "Use at least 8 characters."}
          </p>
          <form className="mt-7 space-y-4" onSubmit={submit}>
            <div>
              <Label>New {kind === "MPIN" ? "MPIN" : "password"}</Label>
              <Input
                name="credential"
                type="password"
                inputMode={kind === "MPIN" ? "numeric" : "text"}
                pattern={kind === "MPIN" ? "[0-9]{6}" : undefined}
                minLength={kind === "PASSWORD" ? 8 : undefined}
                maxLength={kind === "MPIN" ? 6 : 100}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <Label>Confirm {kind === "MPIN" ? "MPIN" : "password"}</Label>
              <Input
                name="confirmCredential"
                type="password"
                inputMode={kind === "MPIN" ? "numeric" : "text"}
                pattern={kind === "MPIN" ? "[0-9]{6}" : undefined}
                minLength={kind === "PASSWORD" ? 8 : undefined}
                maxLength={kind === "MPIN" ? 6 : 100}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? "Saving…" : `Reset ${kind === "MPIN" ? "MPIN" : "password"}`}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
