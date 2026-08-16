import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, tokenStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Business",
    items: [
      { label: "Overview", to: "/", icon: "solar:widget-5-linear" },
      { label: "Cash flow", to: "/cash-flow", icon: "solar:wallet-money-linear" },
      { label: "Inventory", to: "/inventory", icon: "solar:box-linear" },
    ],
  },
  {
    label: "Farm",
    items: [
      { label: "Pigs", to: "/pigs", icon: "mdi:pig-variant-outline" },
      { label: "Operations", to: "/operations", icon: "solar:clipboard-list-linear" },
      { label: "Slaughter", to: "/slaughter", icon: "solar:scale-linear" },
    ],
  },
  {
    label: "Karenderiya",
    items: [
      { label: "Menu", to: "/menu", icon: "solar:notebook-bookmark-linear" },
      { label: "Sales & cooking", to: "/karenderiya", icon: "solar:chef-hat-linear" },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Reports", to: "/reports", icon: "solar:chart-square-linear" },
      { label: "Activity log", to: "/activity-log", icon: "solar:history-linear" },
      { label: "Settings", to: "/settings", icon: "solar:settings-linear" },
    ],
  },
];
const nav = navGroups.flatMap((group) => group.items);

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const current = nav.find((item) => item.to === location.pathname)?.label ?? "Miss V Business";
  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid size-11 place-items-center rounded-2xl border border-white/70 bg-pink-100 text-pink-700 shadow-sm">
          <Icon icon="mdi:pig-variant" className="size-7" />
        </div>
        <div>
          <p className="font-display text-xl font-semibold leading-none text-white">Miss V</p>
          <p className="mt-1 text-[11px] uppercase tracking-[.2em] text-pink-200/75">Business</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-pink-300/55">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-white/12 text-white shadow-inner"
                        : "text-pink-100/70 hover:bg-white/7 hover:text-white",
                    )
                  }
                >
                  <Icon icon={item.icon} className="size-5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 pt-0">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-pink-200/65">
            Owner account
          </p>
          <p className="mt-2 text-sm font-semibold text-white">Miss V</p>
          <button
            type="button"
            className="mt-3 text-xs text-pink-200 hover:text-white"
            onClick={async () => {
              try {
                await api("/auth/logout", { method: "POST" });
              } catch {
                toast.error(
                  "The server could not close the session, but this device was signed out",
                );
              } finally {
                tokenStore.clear();
                navigate("/login", { replace: true });
              }
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-berry-950 lg:flex">
        {sidebar}
      </aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              aria-label="Close navigation"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-stone-950/40 lg:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-berry-950 lg:hidden"
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <main className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-pink-100/90 bg-blush-50/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Icon icon="solar:hamburger-menu-linear" className="size-6" />
            </Button>
            <div>
              <p className="text-xs font-medium text-stone-400">Miss V Business</p>
              <h1 className="font-display text-lg font-semibold leading-none">{current}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold">Today</p>
              <p className="text-[11px] text-stone-400">Piggery + Karenderiya</p>
            </div>
            <div className="grid size-10 place-items-center rounded-full bg-pink-700 text-sm font-bold text-white shadow-sm ring-4 ring-pink-100">
              MV
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
