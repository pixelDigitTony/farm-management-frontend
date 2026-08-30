import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  api,
  restoreAccessToken,
  type SessionUser,
  sessionUserStore,
  tokenStore,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/layout/AppShell";

const AuthPage = lazy(() => import("@/pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const RegisterPage = lazy(() =>
  import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const VerifyEmailPage = lazy(() =>
  import("@/pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })),
);
const ResetCredentialPage = lazy(() =>
  import("@/pages/ResetCredentialPage").then((m) => ({ default: m.ResetCredentialPage })),
);
const AdminPage = lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const EmployeesPage = lazy(() =>
  import("@/pages/EmployeesPage").then((m) => ({ default: m.EmployeesPage })),
);
const InviteRegisterPage = lazy(() =>
  import("@/pages/InviteRegisterPage").then((m) => ({ default: m.InviteRegisterPage })),
);

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CashFlowPage = lazy(() =>
  import("@/pages/CashFlowPage").then((m) => ({ default: m.CashFlowPage })),
);
const CalendarTodosPage = lazy(() =>
  import("@/pages/CalendarTodosPage").then((m) => ({ default: m.CalendarTodosPage })),
);
const PigsPage = lazy(() => import("@/pages/PigsPage").then((m) => ({ default: m.PigsPage })));
const FarmOperationsPage = lazy(() =>
  import("@/pages/FarmOperationsPage").then((m) => ({ default: m.FarmOperationsPage })),
);
const SlaughterPage = lazy(() =>
  import("@/pages/SlaughterPage").then((m) => ({ default: m.SlaughterPage })),
);
const InventoryPage = lazy(() =>
  import("@/pages/InventoryPage").then((m) => ({ default: m.InventoryPage })),
);
const KarenderiyaPage = lazy(() =>
  import("@/pages/KarenderiyaPage").then((m) => ({ default: m.KarenderiyaPage })),
);
const MenuPage = lazy(() => import("@/pages/MenuPage").then((m) => ({ default: m.MenuPage })));
const ReportsPage = lazy(() =>
  import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const ActivityLogPage = lazy(() =>
  import("@/pages/ActivityLogPage").then((m) => ({ default: m.ActivityLogPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function Protected() {
  const session = useQuery({
    queryKey: ["session-user"],
    queryFn: async () => {
      if (!tokenStore.get() && !(await restoreAccessToken())) {
        throw new Error("No active session");
      }
      const result = await api<{ owner: SessionUser }>("/auth/me");
      sessionUserStore.set(result.owner);
      return result.owner;
    },
    retry: false,
  });
  if (session.isLoading) return <PageSkeleton />;
  if (session.isError || !session.data) {
    tokenStore.clear();
    sessionUserStore.clear();
    return <Navigate to="/login" replace />;
  }
  if (!session.data.emailVerified) return <AccountGate user={session.data} kind="email" />;
  if (session.data.role !== 99 && (!session.data.isApproved || session.data.status !== "ACTIVE"))
    return <AccountGate user={session.data} kind="approval" />;
  return <AppShell />;
}

function AccountGate({ user, kind }: { user: SessionUser; kind: "email" | "approval" }) {
  return (
    <div className="grid min-h-screen place-items-center bg-blush-50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-pink-100 bg-white p-8 text-center shadow-xl">
        <h1 className="font-display text-3xl font-semibold">
          {kind === "email" ? "Verify your email" : "Approval pending"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          {kind === "email"
            ? `Open the verification link sent to ${user.email}.`
            : "A super admin must approve this account before the business workspace becomes available."}
        </p>
        {kind === "email" && (
          <Button
            className="mt-6 w-full"
            variant="outline"
            onClick={() =>
              void api("/auth/resend-verification", {
                method: "POST",
                body: JSON.stringify({ email: user.email }),
              })
            }
          >
            Resend verification email
          </Button>
        )}
        <Button className="mt-3 w-full" onClick={() => window.location.reload()}>
          Check status again
        </Button>
        <button
          type="button"
          className="mt-5 text-sm font-semibold text-pink-700"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" }).catch(() => undefined);
            tokenStore.clear();
            sessionUserStore.clear();
            window.location.assign("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
export function App() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <PageSkeleton />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        {/* <Route path="/register" element={<RegisterPage />} /> */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-credential" element={<ResetCredentialPage />} />
        <Route path="/join/:tokenId" element={<InviteRegisterPage />} />
        <Route element={<Protected />}>
          <Route index element={<DashboardPage />} />
          <Route path="cash-flow" element={<CashFlowPage />} />
          <Route path="calendar" element={<CalendarTodosPage />} />
          <Route path="pigs" element={<PigsPage />} />
          <Route path="operations" element={<FarmOperationsPage />} />
          <Route path="slaughter" element={<SlaughterPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="karenderiya" element={<KarenderiyaPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="activity-log" element={<ActivityLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
