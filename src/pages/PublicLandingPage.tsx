import { Icon } from "@iconify/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api } from "@/api/client";
import { CatalogDiscountPrice, DiscountCountdown } from "@/components/CatalogDiscountPrice";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { effectivePrice, useCatalogClock } from "@/lib/catalog-discounts";
import { formatPeso } from "@/lib/utils";
import type {
  LandingCatalogItem,
  LandingCatalogVariant,
  LandingMenuItem,
  LandingPageCommerceSettings,
  LandingPageSection,
  LandingPageTheme,
} from "@/types/landing-page";
import { defaultLandingPageCommerceSettings, normalizeLandingSections } from "@/types/landing-page";

type PublicLandingPage = {
  serverTime?: string;
  slug: string;
  siteTitle: string;
  seoDescription: string;
  publishedAt: string;
  variant: {
    theme: LandingPageTheme;
    commerce?: Partial<LandingPageCommerceSettings>;
    sections?: LandingPageSection[];
    components?: LandingPageSection["components"];
  };
  menuItems: LandingMenuItem[];
  catalogItems: LandingCatalogItem[];
};

type CartLine = {
  key: string;
  sourceType: "MENU_ITEM" | "PRODUCT";
  sourceId: string;
  variantId: string | null;
  name: string;
  variantName: string;
  mediaUrl: string;
  unitPrice: number;
  quantity: number;
};

function cartKey(slug: string) {
  return `miss-v-cart:${slug}`;
}

function lineFromItem(
  item: LandingCatalogItem,
  variant?: LandingCatalogVariant,
  now = Date.now(),
): CartLine {
  return {
    key: `${item.key}:${variant?.variantId ?? ""}`,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    variantId: variant?.variantId ?? null,
    name: item.name,
    variantName: variant?.name ?? "",
    mediaUrl: item.mediaUrls[0] ?? "",
    unitPrice: effectivePrice(variant ?? item, now, item.discount),
    quantity: 1,
  };
}

export function PublicLandingPage({ slug: hostnameSlug }: { slug?: string }) {
  const { slug: routeSlug = "" } = useParams();
  const slug = hostnameSlug ?? routeSlug;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartReadySlug, setCartReadySlug] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [reviewedPrices, setReviewedPrices] = useState("");
  const [priceNotice, setPriceNotice] = useState("");
  const [checkingPrices, setCheckingPrices] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; total: string | number }>();
  const [choosing, setChoosing] = useState<LandingCatalogItem>();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID().replaceAll("-", "_"),
  );
  const page = useQuery({
    queryKey: ["public-landing-page", slug],
    queryFn: () => api<PublicLandingPage>(`/public/landing-pages/${encodeURIComponent(slug)}`),
    retry: false,
    refetchInterval: 30_000,
  });
  const now = useCatalogClock(page.data?.serverTime, page.dataUpdatedAt);
  const boundary = useRef("");
  useEffect(() => {
    const next = (page.data?.catalogItems ?? [])
      .map((item) => {
        const discount = item.discount;
        return discount
          ? `${discount.id}:${now >= Date.parse(discount.startsAt)}:${now >= Date.parse(discount.endsAt)}`
          : "";
      })
      .join("|");
    if (boundary.current && boundary.current !== next) void page.refetch();
    boundary.current = next;
  }, [now, page.data?.catalogItems, page.refetch]);
  const pricedCart = useMemo(
    () =>
      cart.map((line) => {
        const item = page.data?.catalogItems.find(
          (candidate) =>
            candidate.sourceType === line.sourceType && candidate.sourceId === line.sourceId,
        );
        const variant = item?.variants.find((candidate) => candidate.variantId === line.variantId);
        if (!item || (line.variantId && !variant)) return { ...line, unavailable: true };
        const price = effectivePrice(variant ?? item, now, item.discount);
        return {
          ...line,
          unitPrice: price,
          originalPrice: Number((variant ?? item).originalPrice ?? price),
          unavailable:
            !item.isAvailable || (variant ? !variant.isAvailable : item.variants.length > 0),
        };
      }),
    [cart, page.data?.catalogItems, now],
  );
  const pricingSignature = JSON.stringify([
    pricedCart.map((line) => [line.key, line.unitPrice, line.unavailable]),
    page.data?.variant.commerce,
  ]);
  const pricesNeedReview = checkout && pricingSignature !== reviewedPrices;
  const chosenItem = page.data?.catalogItems.find((item) => item.key === choosing?.key);
  useEffect(() => {
    if (!page.data) return;
    document.title = page.data.siteTitle;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = page.data.seoDescription;
  }, [page.data]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(cartKey(slug));
      setCart(stored ? (JSON.parse(stored) as CartLine[]) : []);
    } catch {
      setCart([]);
    }
    setCartReadySlug(slug);
  }, [slug]);
  useEffect(() => {
    if (cartReadySlug === slug) localStorage.setItem(cartKey(slug), JSON.stringify(cart));
  }, [cart, cartReadySlug, slug]);
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const cartTotal = useMemo(
    () =>
      pricedCart.reduce(
        (total, line) => total + Math.round(line.unitPrice * 100) * line.quantity,
        0,
      ) / 100,
    [pricedCart],
  );
  const order = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ orderNumber: string; status: string; total: string | number }>(
        `/public/landing-pages/${encodeURIComponent(slug)}/orders`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: (result) => {
      setSuccess({ orderNumber: result.orderNumber, total: result.total });
      setCart([]);
      setCheckout(false);
      setIdempotencyKey(crypto.randomUUID().replaceAll("-", "_"));
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === "PRICES_CHANGED") {
        setReviewedPrices("");
        setPriceNotice(error.message);
        await page.refetch();
      }
      toast.error(error.message);
    },
  });

  function addLine(item: LandingCatalogItem, variant?: LandingCatalogVariant) {
    const line = lineFromItem(item, variant, now);
    setCart((current) => {
      const existing = current.find((candidate) => candidate.key === line.key);
      if (!existing) return [...current, line];
      return current.map((candidate) =>
        candidate.key === line.key
          ? { ...candidate, quantity: Math.min(99, candidate.quantity + 1) }
          : candidate,
      );
    });
    setChoosing(undefined);
    setCartOpen(true);
  }

  function handleAdd(item: LandingCatalogItem) {
    if (item.variants.length) setChoosing(item);
    else addLine(item);
  }

  function changeQuantity(key: string, quantity: number) {
    if (quantity <= 0) setCart((current) => current.filter((line) => line.key !== key));
    else
      setCart((current) =>
        current.map((line) =>
          line.key === key ? { ...line, quantity: Math.min(99, quantity) } : line,
        ),
      );
  }

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pricesNeedReview || priceNotice || page.isFetching) {
      setPriceNotice("Prices have changed. Review the updated total before placing your order.");
      return;
    }
    if (pricedCart.some((line) => line.unavailable)) {
      toast.error("Remove unavailable products from your cart first.");
      return;
    }
    if (!pricedCart.length || !minimumReached || order.isPending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const fulfillmentMethod = String(values.fulfillmentMethod);
    order.mutate({
      idempotencyKey,
      customer: {
        name: String(values.name).trim(),
        phone: String(values.phone).trim(),
        email: String(values.email ?? "").trim(),
      },
      fulfillmentMethod,
      deliveryAddress:
        fulfillmentMethod === "DELIVERY" ? String(values.deliveryAddress).trim() : "",
      paymentMethod: fulfillmentMethod === "DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_ON_PICKUP",
      items: pricedCart.map((line) => ({
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        variantId: line.variantId,
        quantity: line.quantity,
        expectedUnitPrice: line.unitPrice,
      })),
      expectedTotal: Number(
        (cartTotal + (fulfillmentMethod === "DELIVERY" ? commerce.deliveryFee : 0)).toFixed(2),
      ),
      customerNotes: String(values.customerNotes ?? "").trim(),
    });
  }

  if (page.isLoading)
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton cards={4} />
      </div>
    );
  if (page.isError || !page.data)
    return (
      <main className="grid min-h-screen place-items-center bg-blush-50 p-6 text-center">
        <div>
          <p className="font-display text-5xl font-bold text-pink-700">404</p>
          <h1 className="mt-3 text-2xl font-bold">This page is not published</h1>
          <p className="mt-2 text-sm text-stone-500">
            Check the link or ask the business owner for the current address.
          </p>
        </div>
      </main>
    );
  const commerce: LandingPageCommerceSettings = {
    ...defaultLandingPageCommerceSettings,
    ...page.data.variant.commerce,
    fulfillmentMethods:
      page.data.variant.commerce?.fulfillmentMethods ??
      defaultLandingPageCommerceSettings.fulfillmentMethods,
    paymentMethods:
      page.data.variant.commerce?.paymentMethods ??
      defaultLandingPageCommerceSettings.paymentMethods,
  };
  const minimumReached = cartTotal >= commerce.minimumOrder;
  return (
    <>
      <LandingPageRenderer
        theme={page.data.variant.theme}
        sections={normalizeLandingSections(page.data.variant)}
        menuItems={page.data.menuItems}
        catalogItems={page.data.catalogItems ?? []}
        onAddToCart={commerce.orderingEnabled ? handleAdd : undefined}
      />
      {commerce.orderingEnabled && (page.data.catalogItems?.length ?? 0) > 0 && (
        <button
          type="button"
          className={`fixed bottom-5 z-40 flex items-center gap-3 rounded-full px-5 py-3 font-bold text-white shadow-2xl transition hover:-translate-y-0.5 ${
            commerce.cartButtonPosition === "BOTTOM_LEFT" ? "left-5" : "right-5"
          }`}
          style={{ background: page.data.variant.theme.primaryColor }}
          onClick={() => {
            setSuccess(undefined);
            setCheckout(false);
            setCartOpen(true);
          }}
        >
          <Icon icon="solar:cart-large-2-linear" className="size-5" />
          {commerce.cartButtonLabel}
          {cartCount > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-white text-xs text-stone-900">
              {cartCount}
            </span>
          )}
        </button>
      )}

      <Dialog open={Boolean(choosing)} onOpenChange={(value) => !value && setChoosing(undefined)}>
        <DialogContent>
          <DialogTitle>Choose {choosing?.name} options</DialogTitle>
          <DialogDescription>
            Select the size, color, or style before adding this item.
          </DialogDescription>
          <div className="mt-5 space-y-3">
            <DiscountCountdown discount={chosenItem?.discount} now={now} />
            {chosenItem?.variants.map((variant) => (
              <button
                key={variant.variantId}
                type="button"
                disabled={!variant.isAvailable || !chosenItem.isAvailable}
                className="flex w-full items-center justify-between rounded-xl border border-pink-100 p-4 text-left transition hover:border-pink-400 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => addLine(chosenItem, variant)}
              >
                <div>
                  <p className="font-semibold">{variant.name}</p>
                  {variant.attributes.length > 0 && (
                    <p className="mt-1 text-xs text-stone-500">
                      {variant.attributes
                        .map((attribute) => `${attribute.name}: ${attribute.value}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-pink-700">
                    <CatalogDiscountPrice
                      pricing={{ ...variant, discount: chosenItem.discount }}
                      now={now}
                      showCountdown={false}
                    />
                  </div>
                  <p className="text-xs text-stone-500">
                    {variant.isAvailable ? "Available" : "Unavailable"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-xl">
          {success ? (
            <div className="py-5 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <Icon icon="solar:check-circle-bold" className="size-9" />
              </div>
              <DialogTitle className="mt-5">Order received</DialogTitle>
              <DialogDescription>
                The owner will review your order before confirming it.
              </DialogDescription>
              <div className="mt-6 rounded-2xl bg-pink-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                  Order number
                </p>
                <p className="mt-1 text-2xl font-bold text-pink-700">{success.orderNumber}</p>
                <p className="mt-2 font-semibold">Total: {formatPeso(success.total)}</p>
              </div>
              <Button className="mt-6" onClick={() => setCartOpen(false)}>
                Continue browsing
              </Button>
            </div>
          ) : checkout ? (
            <>
              <DialogTitle>Checkout</DialogTitle>
              <DialogDescription>
                Your total will be verified when the order is submitted.
              </DialogDescription>
              {(pricesNeedReview || priceNotice) && (
                <div
                  role="alert"
                  className="mt-4 space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <p>{priceNotice || "Prices have changed. Review the updated total below."}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page.isFetching}
                    onClick={() => {
                      setReviewedPrices(pricingSignature);
                      setPriceNotice("");
                    }}
                  >
                    I reviewed the updated total
                  </Button>
                </div>
              )}
              <CheckoutForm
                subtotal={cartTotal}
                settings={commerce}
                pending={order.isPending || page.isFetching}
                blocked={
                  pricesNeedReview ||
                  Boolean(priceNotice) ||
                  pricedCart.some((line) => line.unavailable) ||
                  !minimumReached
                }
                onBack={() => setCheckout(false)}
                onSubmit={submitOrder}
              />
            </>
          ) : (
            <>
              <DialogTitle>Your cart</DialogTitle>
              <DialogDescription>
                {cartCount
                  ? `${cartCount} item${cartCount === 1 ? "" : "s"} ready for checkout.`
                  : "Your cart is empty."}
              </DialogDescription>
              <div className="mt-5 max-h-[55vh] space-y-4 overflow-y-auto">
                {pricedCart.map((line) => (
                  <div key={line.key} className="flex gap-3 border-b border-pink-100 pb-4">
                    {line.mediaUrl ? (
                      <img
                        src={line.mediaUrl}
                        alt={line.name}
                        className="size-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="grid size-16 place-items-center rounded-xl bg-pink-50 text-pink-400">
                        <Icon icon="solar:box-linear" className="size-7" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{line.name}</p>
                      {line.variantName && (
                        <p className="text-xs text-stone-500">{line.variantName}</p>
                      )}
                      <p className="mt-1 text-sm font-bold text-pink-700">
                        {"originalPrice" in line && Number(line.originalPrice) > line.unitPrice && (
                          <del className="mr-2 font-normal text-stone-500">
                            {formatPeso(Number(line.originalPrice))}
                          </del>
                        )}
                        {formatPeso(line.unitPrice)}
                      </p>
                      {line.unavailable && (
                        <p className="text-xs text-red-700">Unavailable — remove from cart</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 self-center">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Remove one ${line.name}`}
                        onClick={() => changeQuantity(line.key, line.quantity - 1)}
                      >
                        <Icon icon="solar:minus-circle-linear" />
                      </Button>
                      <span className="w-8 text-center font-semibold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add one ${line.name}`}
                        onClick={() => changeQuantity(line.key, line.quantity + 1)}
                      >
                        <Icon icon="solar:add-circle-linear" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-pink-100 pt-5">
                <span className="font-semibold">Subtotal</span>
                <span className="text-xl font-bold text-pink-700">{formatPeso(cartTotal)}</span>
              </div>
              {!minimumReached && cart.length > 0 && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Add {formatPeso(commerce.minimumOrder - cartTotal)} more to reach the minimum
                  order of {formatPeso(commerce.minimumOrder)}.
                </p>
              )}
              <Button
                className="mt-4 w-full"
                disabled={
                  !cart.length ||
                  !minimumReached ||
                  checkingPrices ||
                  pricedCart.some((line) => line.unavailable)
                }
                onClick={async () => {
                  setCheckingPrices(true);
                  const result = await page.refetch();
                  setCheckingPrices(false);
                  if (result.isError) {
                    toast.error("Unable to refresh prices. Please try again.");
                    return;
                  }
                  setReviewedPrices(pricingSignature);
                  setPriceNotice("");
                  setCheckout(true);
                }}
              >
                {checkingPrices ? "Checking prices..." : "Continue to checkout"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CheckoutForm({
  subtotal,
  settings,
  pending,
  blocked,
  onBack,
  onSubmit,
}: {
  subtotal: number;
  settings: LandingPageCommerceSettings;
  pending: boolean;
  blocked: boolean;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY">(
    settings.fulfillmentMethods[0] ?? "PICKUP",
  );
  const deliveryFee = method === "DELIVERY" ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  return (
    <form className="mt-5 space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="checkout-name">
          <Label>Name</Label>
          <Input id="checkout-name" name="name" required maxLength={120} />
        </label>
        <label htmlFor="checkout-phone">
          <Label>Mobile number</Label>
          <Input id="checkout-phone" name="phone" required maxLength={40} inputMode="tel" />
        </label>
      </div>
      <label htmlFor="checkout-email">
        <Label>Email (optional)</Label>
        <Input id="checkout-email" name="email" type="email" maxLength={160} />
      </label>
      <div>
        <Label>How will you receive the order?</Label>
        <div
          className={`grid gap-3 ${settings.fulfillmentMethods.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {settings.fulfillmentMethods.map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-xl border p-3 text-sm font-semibold ${method === option ? "border-pink-600 bg-pink-50 text-pink-700" : "border-stone-200"}`}
              onClick={() => setMethod(option)}
            >
              {option === "PICKUP" ? "Pickup" : "Delivery"}
            </button>
          ))}
        </div>
        <input type="hidden" name="fulfillmentMethod" value={method} />
      </div>
      {method === "DELIVERY" && (
        <label htmlFor="checkout-address">
          <Label>Delivery address</Label>
          <textarea
            id="checkout-address"
            name="deliveryAddress"
            required
            maxLength={500}
            className="min-h-24 w-full rounded-xl border border-pink-100 p-3 text-sm"
          />
        </label>
      )}
      <label htmlFor="checkout-notes">
        <Label>Order notes (optional)</Label>
        <textarea
          id="checkout-notes"
          name="customerNotes"
          maxLength={1000}
          className="min-h-20 w-full rounded-xl border border-pink-100 p-3 text-sm"
        />
      </label>
      <div className="rounded-xl bg-pink-50 p-4 text-sm">
        <div className="flex justify-between text-stone-600">
          <span>Subtotal</span>
          <span>{formatPeso(subtotal)}</span>
        </div>
        {method === "DELIVERY" && (
          <div className="mt-2 flex justify-between text-stone-600">
            <span>Delivery fee</span>
            <span>{formatPeso(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span className="text-pink-700">{formatPeso(total)}</span>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          {method === "DELIVERY" ? "Cash on delivery" : "Pay when you pick up the order"}.
          Submitting does not charge you online.
        </p>
        {settings.checkoutInstructions && (
          <p className="mt-3 border-t border-pink-100 pt-3 text-xs text-stone-600">
            {settings.checkoutInstructions}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button type="button" className="flex-1" variant="outline" onClick={onBack}>
          Back to cart
        </Button>
        <Button type="submit" className="flex-1" disabled={pending || blocked}>
          {pending ? "Submitting..." : "Place order"}
        </Button>
      </div>
    </form>
  );
}
