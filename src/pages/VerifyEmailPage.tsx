import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthShell } from "@/layout/AuthShell";

type VerificationState = "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<VerificationState>("loading");
  const [message, setMessage] = useState("Verifying your email address…");
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("The verification token is missing.");
      return;
    }
    api<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        setState("success");
        setMessage(result.message);
      })
      .catch((error) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Email verification failed");
      });
  }, [params]);

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        {state === "loading" ? (
          <>
            <Skeleton className="mx-auto size-16 rounded-2xl" />
            <Skeleton className="mx-auto mt-6 h-8 w-52" />
            <Skeleton className="mx-auto mt-3 h-4 w-72" />
          </>
        ) : (
          <>
            <div
              className={`mx-auto grid size-16 place-items-center rounded-2xl ${state === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
            >
              <Icon
                icon={
                  state === "success"
                    ? "solar:verified-check-bold-duotone"
                    : "solar:danger-circle-bold-duotone"
                }
                className="size-9"
              />
            </div>
            <h1 className="mt-6 font-display text-3xl font-semibold">
              {state === "success" ? "Email verified" : "Verification unsuccessful"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-500">{message}</p>
            <Button className="mt-7 w-full" asChild>
              <Link to="/login">
                {state === "success" ? "Continue to sign in" : "Return to sign in"}
              </Link>
            </Button>
          </>
        )}
      </motion.div>
    </AuthShell>
  );
}
