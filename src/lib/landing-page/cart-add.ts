import type { LandingCatalogItem, LandingCatalogVariant } from "@/types/landing-page";

export const CART_LINE_QUANTITY_LIMIT = 99;

export type CartAddRejectionReason =
  | "PENDING_SUBMISSION"
  | "UNAVAILABLE_SELECTION"
  | "QUANTITY_LIMIT";

export type CartAddResult = {
  acceptedQuantity: number;
  /** QUANTITY_LIMIT can accompany a positive, partially accepted addition. */
  rejectionReason: CartAddRejectionReason | null;
};

export type StorefrontAddToCart = (
  item: LandingCatalogItem,
  variant?: LandingCatalogVariant,
  quantity?: number,
  shopNow?: boolean,
) => CartAddResult;

/** Local feedback only. Server order pricing and availability remain authoritative. */
export function getCartAddResult({
  item,
  variant,
  requestedQuantity = 1,
  currentQuantity = 0,
  pending = false,
}: {
  item: LandingCatalogItem;
  variant?: LandingCatalogVariant;
  requestedQuantity?: number;
  currentQuantity?: number;
  pending?: boolean;
}): CartAddResult {
  if (pending) return { acceptedQuantity: 0, rejectionReason: "PENDING_SUBMISSION" };
  const selected = item.variants.find((candidate) => candidate.variantId === variant?.variantId);
  if (
    !item.isAvailable ||
    item.effectiveActive === false ||
    (item.variants.length > 0 ? !selected?.isAvailable : Boolean(variant))
  )
    return { acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" };
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1)
    return { acceptedQuantity: 0, rejectionReason: "QUANTITY_LIMIT" };
  const remaining = Math.max(0, CART_LINE_QUANTITY_LIMIT - currentQuantity);
  const acceptedQuantity = Math.min(requestedQuantity, remaining);
  return {
    acceptedQuantity,
    rejectionReason: acceptedQuantity < requestedQuantity ? "QUANTITY_LIMIT" : null,
  };
}
