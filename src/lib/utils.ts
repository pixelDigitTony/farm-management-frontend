import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});
export const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

export function toFiniteNumber(value: unknown) {
  const normalized =
    typeof value === "object" &&
    value !== null &&
    "$numberDecimal" in value &&
    typeof value.$numberDecimal === "string"
      ? value.$numberDecimal
      : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const formatPeso = (value: unknown) => peso.format(toFiniteNumber(value));
