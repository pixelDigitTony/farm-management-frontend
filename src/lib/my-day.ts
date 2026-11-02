import type { LandingCatalogItem, LandingPageTheme } from "@/types/landing-page";
import { validLocalDate } from "./product-availability";

export type PublicMyDay = {
  id: string;
  revision: number;
  heading: string;
  description: string;
  startsAt: string;
  endsAt: string;
  productKeys: string[];
};
export type MyDayCampaign = {
  _id: string;
  revision: number;
  name: string;
  heading: string;
  description: string;
  landingPageId: string;
  productIds: string[];
  startsAt: string;
  endsAt: string;
  timezone: string;
  isEnabled: boolean;
  status: string;
  diagnostics: string[];
  pageName: string;
};
export type MyDayPage = { _id: string; name: string; slug: string; isPublished: boolean };
export type MyDayList = {
  items: MyDayCampaign[];
  pages: MyDayPage[];
  total: number;
  timezone: string;
  serverTime: string;
};
export type MyDayPreview = {
  myDay: PublicMyDay | null;
  catalogItems: LandingCatalogItem[];
  theme: LandingPageTheme | null;
  excluded: { productId: string; reason: string }[];
  at: string;
};
export function zonedInput(instant: string | number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
/** Enumerate actual instants, rejecting DST gaps and requiring a choice for folds. */
export function localInstants(local: string, timezone: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ||
    !validLocalDate(local.slice(0, 10)) ||
    Number(local.slice(11, 13)) > 23 ||
    Number(local.slice(14)) > 59
  )
    return [];
  const nominal = Date.parse(`${local}:00Z`);
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 3) {
    const probe = nominal + h * 3600_000;
    offsets.add(Date.parse(`${zonedInput(probe, timezone)}:00Z`) - probe);
  }
  return [...offsets]
    .map((offset) => nominal - offset)
    .filter((time) => zonedInput(time, timezone) === local)
    .sort((a, b) => a - b)
    .map((time) => new Date(time).toISOString());
}
export function displayDay(time: number, timezone: string) {
  return zonedInput(time, timezone).slice(0, 10);
}
export function myDayStorageKey(businessId: string, pageId: string) {
  return `my-day:v1:${businessId}:${pageId}`;
}
