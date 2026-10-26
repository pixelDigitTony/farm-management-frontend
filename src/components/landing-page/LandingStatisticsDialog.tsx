import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, sessionUserStore } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getPublicSiteUrl } from "@/lib/public-site";
import type { LandingPageRecord } from "@/types/landing-page";

export type LandingStatistics = {
  enabled: boolean;
  generatedAt: string;
  trackingStartsAt: string | null;
  summary: {
    uniqueVisitors: number;
    visits: number;
    pageViews: number;
    ordersCreated: number;
    ctaClicks: number;
    checkoutStarts: number;
    convertedVisits: number;
    conversionRate: number | null;
  };
  daily: { date: string; views: number; visitors: number }[];
  referrers: { _id: string; count: number }[];
  devices: { _id: string; count: number }[];
};
const dayInManila = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const offsetDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function LandingStatisticsDialog({
  page,
  onClose,
}: {
  page: LandingPageRecord;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(() => offsetDay(dayInManila(), -6));
  const [through, setThrough] = useState(dayInManila);
  const session = sessionUserStore.get();
  const valid = Boolean(
    from && through && from <= through && Date.parse(through) - Date.parse(from) < 90 * 86400000,
  );
  const stats = useQuery({
    queryKey: ["landing-statistics", session?.id, page._id, from, through],
    queryFn: ({ signal }) =>
      api<LandingStatistics>(
        `/landing-page/pages/${page._id}/statistics?${new URLSearchParams({ from: `${from}T00:00:00+08:00`, to: `${offsetDay(through, 1)}T00:00:00+08:00`, timezone: "Asia/Manila" })}`,
        { signal },
      ),
    enabled: valid,
    retry: false,
  });
  const data = stats.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[calc(100dvh-2rem)] p-4 sm:p-6">
        <DialogTitle>Statistics · {page.name ?? page.siteTitle}</DialogTitle>
        <DialogDescription>
          {page.isPublished ? "Published" : "Unpublished"} · {getPublicSiteUrl(page.slug)} ·
          Asia/Manila
        </DialogDescription>
        <div className="my-5 flex flex-wrap items-end gap-2">
          {[1, 7, 30].map((days) => (
            <Button
              key={days}
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(offsetDay(dayInManila(), 1 - days));
                setThrough(dayInManila());
              }}
            >
              {days === 1 ? "Today" : `${days} days`}
            </Button>
          ))}
          <label htmlFor="statistics-from" className="text-xs">
            From
            <Input
              type="date"
              id="statistics-from"
              aria-label="Statistics from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label htmlFor="statistics-through" className="text-xs">
            Through
            <Input
              type="date"
              id="statistics-through"
              aria-label="Statistics through"
              value={through}
              max={dayInManila()}
              onChange={(e) => setThrough(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            className="disabled:opacity-100"
            onClick={() => void stats.refetch()}
            disabled={!valid || stats.isFetching}
          >
            Refresh
          </Button>
        </div>
        {!valid && <p role="alert">Choose an ordered date range of up to 90 days.</p>}
        {stats.isPending && valid && <p role="status">Loading statistics…</p>}
        {stats.isError && (
          <QueryError message={stats.error.message} retry={() => void stats.refetch()} />
        )}
        {data && (
          <div className="space-y-5">
            {!data.enabled && (
              <p className="rounded-xl bg-amber-50 p-3">
                Visitor tracking is disabled. Historical figures are shown.
              </p>
            )}
            <p className="text-xs text-stone-500">
              {data.trackingStartsAt
                ? `Tracking starts on ${new Date(data.trackingStartsAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}.`
                : "No visitor events recorded yet. Tracking starts when a visitor accepts analytics."}{" "}
              Counts estimate browser identities.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Unique visitors", data.summary.uniqueVisitors],
                ["Visits", data.summary.visits],
                ["Page views", data.summary.pageViews],
                ["Orders created", data.summary.ordersCreated],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <p className="text-xs text-stone-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-sm">
              CTA clicks: {data.summary.ctaClicks} · Checkout starts: {data.summary.checkoutStarts}{" "}
              · Attributed visits: {data.summary.convertedVisits} · Visit conversion:{" "}
              {data.summary.conversionRate === null
                ? "—"
                : `${data.summary.conversionRate.toFixed(1)}%`}
            </p>
            {!data.summary.pageViews ? (
              <p className="rounded-xl bg-stone-50 p-5">No visits recorded in this period.</p>
            ) : (
              <div>
                <h3 className="font-semibold">Daily visitors and views</h3>
                <div className="mt-3 flex h-28 items-end gap-1" aria-hidden="true">
                  {data.daily.map((day) => (
                    <div
                      key={day.date}
                      className="flex-1 rounded-t bg-pink-500"
                      title={`${day.date}: ${day.views} views`}
                      style={{
                        height: `${Math.max(3, (day.views / Math.max(...data.daily.map((d) => d.views), 1)) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">View daily data table</summary>
                  <table className="mt-2 w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Visitors</th>
                        <th>Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((day) => (
                        <tr key={day.date}>
                          <td>{day.date}</td>
                          <td>{day.visitors}</td>
                          <td>{day.views}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Referrer domains", data.referrers],
                ["Devices", data.devices],
              ].map(([heading, rows]) => (
                <div key={String(heading)}>
                  <h3 className="font-semibold">{String(heading)}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(rows as LandingStatistics["devices"]).map((row) => (
                      <li key={row._id} className="flex justify-between gap-3">
                        <span>{row._id || "direct/unknown"}</span>
                        <span>{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500">
              Updated{" "}
              {new Date(data.generatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              {stats.isError ? " · Showing stale data" : ""}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
