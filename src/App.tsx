import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { tokenStore } from "@/api/client";
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

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CashFlowPage = lazy(() =>
  import("@/pages/CashFlowPage").then((m) => ({ default: m.CashFlowPage })),
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
  return tokenStore.get() ? <AppShell /> : <Navigate to="/login" replace />;
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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-credential" element={<ResetCredentialPage />} />
        <Route element={<Protected />}>
          <Route index element={<DashboardPage />} />
          <Route path="cash-flow" element={<CashFlowPage />} />
          <Route path="pigs" element={<PigsPage />} />
          <Route path="operations" element={<FarmOperationsPage />} />
          <Route path="slaughter" element={<SlaughterPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="karenderiya" element={<KarenderiyaPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="activity-log" element={<ActivityLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
