import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const metricSkeletons = ["metric-a", "metric-b", "metric-c", "metric-d"];
const contentSkeletons = [
  "content-a",
  "content-b",
  "content-c",
  "content-d",
  "content-e",
  "content-f",
];

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-pink-100/80", className)} />
  );
}

export function PageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      role="status"
      aria-label="Loading page"
      className="space-y-6"
    >
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricSkeletons.slice(0, Math.min(cards, 4)).map((key) => (
          <Skeleton key={key} className="h-32" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {contentSkeletons.slice(0, Math.max(2, cards - 4)).map((key) => (
          <Skeleton key={key} className="h-72" />
        ))}
      </div>
      <span className="sr-only">Loading Miss V Business data…</span>
    </motion.div>
  );
}
