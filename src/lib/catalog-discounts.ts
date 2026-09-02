import { useEffect, useSyncExternalStore } from "react";

export type ProductDiscount = {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
};
export type CatalogDiscount = Omit<ProductDiscount, "id"> & { _id: string; productIds: string[] };
export type DiscountPricing = {
  price?: string | number;
  originalPrice?: string | number;
  discountedPrice?: string | number;
  discount?: ProductDiscount | null;
};

let clockOffset = 0;
let clockNow = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function tick() {
  clockNow = Date.now() + clockOffset;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      window.removeEventListener("focus", tick);
    }
  };
}
export function useCatalogClock(serverTime?: string, receivedAt?: number) {
  useEffect(() => {
    if (serverTime && Number.isFinite(Date.parse(serverTime))) {
      clockOffset = Date.parse(serverTime) - (receivedAt || Date.now());
      tick();
    }
  }, [serverTime, receivedAt]);
  return useSyncExternalStore(subscribe, () => clockNow);
}

export function discountStatus(discount: ProductDiscount | CatalogDiscount, now: number) {
  if (now >= Date.parse(discount.endsAt)) return "Expired";
  if (!discount.isEnabled) return "Inactive";
  return now < Date.parse(discount.startsAt) ? "Scheduled" : "Active";
}
export function countdown(target: string, now: number) {
  const total = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
export function effectivePrice(pricing: DiscountPricing, now: number, discount = pricing.discount) {
  return Number(
    discount && discountStatus(discount, now) === "Active"
      ? (pricing.discountedPrice ?? pricing.price ?? 0)
      : (pricing.originalPrice ?? pricing.price ?? 0),
  );
}
export function previewDiscount(price: number, type: ProductDiscount["type"], value: number) {
  const reduction = type === "PERCENTAGE" ? (price * value) / 100 : value;
  return Math.max(0, Math.round((price - reduction + Number.EPSILON) * 100) / 100);
}
export function manilaInput(date: string | number) {
  return new Date(new Date(date).getTime() + 8 * 3600_000).toISOString().slice(0, 19);
}
export function fromManilaInput(value: string) {
  return new Date(`${value}+08:00`).toISOString();
}
