import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";

export function MetricCard({
  label,
  value,
  icon,
  detail,
  tone = "pink",
  index = 0,
}: {
  label: string;
  value: string;
  icon: string;
  detail?: string;
  tone?: "pink" | "amber" | "blue" | "red";
  index?: number;
}) {
  const colors = {
    pink: "bg-pink-100 text-pink-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
    red: "bg-red-100 text-red-700",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</p>
            {detail && <p className="mt-1 text-xs text-stone-500">{detail}</p>}
          </div>
          <div className={cn("grid size-10 place-items-center rounded-xl", colors[tone])}>
            <Icon icon={icon} className="size-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
