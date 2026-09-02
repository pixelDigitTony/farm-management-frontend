import {
  countdown,
  type DiscountPricing,
  discountStatus,
  effectivePrice,
  type ProductDiscount,
} from "@/lib/catalog-discounts";
import { formatPeso } from "@/lib/utils";
import { Badge } from "./ui/badge";

export function DiscountCountdown({
  discount,
  now,
}: {
  discount?: ProductDiscount | null;
  now: number;
}) {
  if (!discount) return null;
  const status = discountStatus(discount, now);
  if (status !== "Active" && status !== "Scheduled") return null;
  return (
    <div className="space-y-1 text-xs">
      <Badge tone={status === "Active" ? "green" : "amber"}>
        {status === "Scheduled" ? "Upcoming · " : ""}
        {discount.type === "PERCENTAGE"
          ? `${discount.value}% off`
          : `${formatPeso(discount.value)} off`}
      </Badge>
      {status === "Scheduled" && (
        <p className="tabular-nums">Starts in {countdown(discount.startsAt, now)}</p>
      )}
      <p className="tabular-nums">Ends in {countdown(discount.endsAt, now)}</p>
    </div>
  );
}

export function CatalogDiscountPrice({
  pricing,
  now,
  from = false,
  showCountdown = true,
}: {
  pricing: DiscountPricing;
  now: number;
  from?: boolean;
  showCountdown?: boolean;
}) {
  const price = effectivePrice(pricing, now);
  const original = Number(pricing.originalPrice ?? pricing.price ?? 0);
  return (
    <div className="space-y-2">
      <p className="font-bold">
        {from ? "From " : ""}
        {original > price && (
          <del className="mr-2 text-sm font-normal opacity-60">{formatPeso(original)}</del>
        )}
        {formatPeso(price)}
      </p>
      {showCountdown && <DiscountCountdown discount={pricing.discount} now={now} />}
    </div>
  );
}
