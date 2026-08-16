import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10",
        className,
      )}
      {...props}
    />
  );
}
export function Label({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500",
        className,
      )}
      {...props}
    />
  );
}
