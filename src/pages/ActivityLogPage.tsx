import { Icon } from "@iconify/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useState } from "react";
import { api } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Header } from "./PigsPage";

type ActivityEntry = {
  _id: string;
  action: string;
  targetCollection: string;
  targetDocumentId?: string;
  changedFields?: string[];
  reason?: string;
  requestMethod?: string;
  requestPath?: string;
  responseStatus?: number;
  outcome?: "SUCCESS" | "FAILED";
  errorMessage?: string;
  createdAt: string;
};

type ActivityResponse = {
  items: ActivityEntry[];
  page: number;
  limit: number;
  total: number;
  pages: number;
};

const actions = [
  "ALL",
  "CREATE",
  "POST",
  "UPDATE",
  "DELETE",
  "VOID",
  "ADJUST",
  "LOGIN",
  "REGISTER",
  "VERIFY_EMAIL",
  "LOGOUT",
];
const skeletonRows = [
  "activity-a",
  "activity-b",
  "activity-c",
  "activity-d",
  "activity-e",
  "activity-f",
];

const actionStyle: Record<string, { icon: string; className: string }> = {
  CREATE: { icon: "solar:add-circle-linear", className: "bg-sky-50 text-sky-700" },
  POST: { icon: "solar:add-circle-linear", className: "bg-sky-50 text-sky-700" },
  UPDATE: { icon: "solar:pen-new-square-linear", className: "bg-amber-50 text-amber-700" },
  ADJUST: { icon: "solar:tuning-square-2-linear", className: "bg-amber-50 text-amber-700" },
  DELETE: { icon: "solar:trash-bin-trash-linear", className: "bg-red-50 text-red-700" },
  VOID: { icon: "solar:close-circle-linear", className: "bg-red-50 text-red-700" },
  LOGIN: { icon: "solar:login-3-linear", className: "bg-emerald-50 text-emerald-700" },
  LOGOUT: { icon: "solar:logout-3-linear", className: "bg-stone-100 text-stone-600" },
  REGISTER: { icon: "solar:user-plus-linear", className: "bg-pink-50 text-pink-700" },
  VERIFY_EMAIL: {
    icon: "solar:verified-check-linear",
    className: "bg-emerald-50 text-emerald-700",
  },
};

const targetNames: Record<string, string> = {
  auth: "Account",
  "operations/slaughters": "Slaughter record",
  "operations/menu-recipes": "Menu recipe",
  "resources/pigs": "Pig record",
  "resources/expenses": "Expense",
  "resources/inventory-items": "Inventory item",
  "resources/menu-items": "Menu item",
  "resources/cash-transactions": "Cash transaction",
  "settings/business": "Business settings",
  "settings/slaughter": "Slaughter settings",
};

function titleCase(value: string) {
  return value
    .split(/[/_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function activityTarget(entry: ActivityEntry) {
  return targetNames[entry.targetCollection] ?? titleCase(entry.targetCollection || "Activity");
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading activity">
      {skeletonRows.map((row) => (
        <div key={row} className="flex gap-3 rounded-2xl border border-pink-100/70 p-4">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="hidden h-5 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function ActivityLogPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("ALL");
  const [outcome, setOutcome] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), limit: "25", action, outcome });
  if (search.trim()) query.set("search", search.trim());
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const activity = useQuery({
    queryKey: ["activity-log", page, action, outcome, search, from, to],
    queryFn: () => api<ActivityResponse>(`/activity?${query.toString()}`),
    placeholderData: keepPreviousData,
  });

  const setFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setAction("ALL");
    setOutcome("ALL");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const hasFilters = Boolean(search || from || to || action !== "ALL" || outcome !== "ALL");

  return (
    <div className="space-y-6">
      <Header
        title="Activity log"
        description="A searchable record of account activity and every change made to your business data."
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_170px_160px_160px_auto]">
            <div>
              <Label>Search activity</Label>
              <div className="relative">
                <Icon
                  icon="solar:magnifer-linear"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
                />
                <Input
                  id="activity-search"
                  aria-label="Search activity"
                  className="pl-9"
                  value={search}
                  onChange={(event) => setFilter(setSearch, event.target.value)}
                  placeholder="Record, route, or error"
                />
              </div>
            </div>
            <div>
              <Label>Action</Label>
              <Select value={action} onValueChange={(value) => setFilter(setAction, value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "ALL" ? "All actions" : titleCase(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Result</Label>
              <Select value={outcome} onValueChange={(value) => setFilter(setOutcome, value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All results</SelectItem>
                  <SelectItem value="SUCCESS">Successful</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From</Label>
              <Input
                id="activity-from"
                aria-label="Activity from date"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFilter(setFrom, event.target.value)}
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                id="activity-to"
                aria-label="Activity to date"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setFilter(setTo, event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Recorded activity</h2>
              <p className="text-sm text-stone-500">
                {activity.data
                  ? `${activity.data.total.toLocaleString()} total interactions`
                  : "Loading interactions"}
              </p>
            </div>
            {activity.isFetching && !activity.isLoading ? (
              <div className="flex items-center gap-2 text-xs font-medium text-pink-700">
                <Icon icon="solar:refresh-linear" className="size-4 animate-spin" />
                Updating
              </div>
            ) : null}
          </div>

          {activity.isLoading ? <ActivitySkeleton /> : null}
          {activity.isError ? (
            <QueryError message={activity.error.message} retry={() => activity.refetch()} />
          ) : null}
          {activity.data?.items.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-6 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-pink-700 shadow-sm">
                  <Icon icon="solar:history-linear" className="size-6" />
                </div>
                <h3 className="mt-3 font-semibold">No activity found</h3>
                <p className="mt-1 max-w-sm text-sm text-stone-500">
                  {hasFilters
                    ? "Try clearing some filters to see more interactions."
                    : "New account and business changes will appear here automatically."}
                </p>
              </div>
            </div>
          ) : null}
          {activity.data?.items.length ? (
            <div className="space-y-2">
              {activity.data.items.map((entry, index) => {
                const style = actionStyle[entry.action] ?? {
                  icon: "solar:history-linear",
                  className: "bg-pink-50 text-pink-700",
                };
                const failed = entry.outcome === "FAILED";
                return (
                  <motion.article
                    key={entry._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.25), duration: 0.18 }}
                    className="flex gap-3 rounded-2xl border border-pink-100/80 bg-white p-4 transition-colors hover:bg-pink-50/30"
                  >
                    <div
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        style.className,
                      )}
                    >
                      <Icon icon={style.icon} className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {titleCase(entry.action)} · {activityTarget(entry)}
                        </p>
                        <Badge
                          className={cn(
                            failed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700",
                          )}
                        >
                          {failed ? "Failed" : "Successful"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-stone-500">
                        {format(new Date(entry.createdAt), "MMM d, yyyy · h:mm a")}
                        {entry.requestMethod && entry.requestPath
                          ? ` · ${entry.requestMethod} ${entry.requestPath}`
                          : ""}
                        {entry.responseStatus ? ` · ${entry.responseStatus}` : ""}
                      </p>
                      {entry.changedFields?.length ? (
                        <p
                          className="mt-1 truncate text-xs text-stone-400"
                          title={entry.changedFields.join(", ")}
                        >
                          Fields: {entry.changedFields.map(titleCase).join(", ")}
                        </p>
                      ) : null}
                      {failed && entry.errorMessage ? (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                          {entry.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          ) : null}

          {activity.data && activity.data.pages > 1 ? (
            <div className="mt-5 flex items-center justify-between border-t border-pink-100 pt-4">
              <p className="text-sm text-stone-500">
                Page {activity.data.page} of {activity.data.pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || activity.isFetching}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= activity.data.pages || activity.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
