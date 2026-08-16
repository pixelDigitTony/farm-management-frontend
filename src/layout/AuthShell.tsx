import { Icon } from "@iconify/react";
import type { ReactNode } from "react";

export function AuthShell({
  children,
  width = "max-w-md",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className="grid min-h-screen bg-blush-50 lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-berry-950 p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="grain absolute inset-0 opacity-30" />
        <Brand />
        <div className="relative max-w-xl">
          <p className="font-display text-5xl font-semibold leading-[1.08]">
            Know where every peso goes—from pigpen to plate.
          </p>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-pink-100/75">
            Simple costing, clear cash flow, and connected piggery and karenderiya operations for
            one focused owner.
          </p>
        </div>
        <div className="relative flex gap-7 text-sm text-pink-100/70">
          <span>PHP only</span>
          <span>Owner operated</span>
          <span>Traceable costing</span>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className={`w-full ${width}`}>
          <div className="mb-8 lg:hidden">
            <Brand dark />
            <p className="mt-3 text-sm text-stone-500">Farm-to-table cash and cost management.</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="relative flex items-center gap-3">
      <div className="grid size-12 place-items-center rounded-2xl border border-white/70 bg-pink-100 text-pink-700 shadow-sm">
        <Icon icon="mdi:pig-variant" className="size-7" />
      </div>
      <div>
        <p
          className={`font-display text-2xl font-semibold ${dark ? "text-berry-950" : "text-white"}`}
        >
          Miss V Business
        </p>
        <p
          className={`text-xs uppercase tracking-[.22em] ${dark ? "text-pink-700" : "text-pink-200/75"}`}
        >
          Farm to table
        </p>
      </div>
    </div>
  );
}
