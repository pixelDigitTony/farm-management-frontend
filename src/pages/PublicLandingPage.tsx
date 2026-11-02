import { Icon } from "@iconify/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api } from "@/api/client";
import { CatalogDiscountPrice, LiveDiscountCountdown } from "@/components/CatalogDiscountPrice";
import { StorefrontBlock } from "@/components/landing-page/blocks/StorefrontBlocks";
import {
  contrastingButtonText,
  LandingPageRenderer,
} from "@/components/landing-page/LandingPageRenderer";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useLandingAnalytics } from "@/hooks/useLandingAnalytics";
import { effectivePrice, useCatalogPricingClock } from "@/lib/catalog-discounts";
import { type CartAddResult, getCartAddResult } from "@/lib/landing-page/cart-add";
import {
  landingThemeStyle,
  PUBLIC_CART_BAR_CLASS,
  STOREFRONT_PORTAL_CLASS,
} from "@/lib/landing-page/theme";
import { formatPeso } from "@/lib/utils";
import type {
  LandingCatalogItem,
  LandingCatalogVariant,
  LandingMenuItem,
  LandingPageCommerceSettings,
  LandingPageSection,
  LandingPageTheme,
  TemplateId,
} from "@/types/landing-page";
import { defaultLandingPageCommerceSettings, normalizeLandingSections } from "@/types/landing-page";

type PublicLandingPage = {
  analyticsEnabled?: boolean;
  pageId?: string;
  businessId?: string;
  nextTransitionAt?: string | null;
  serverTime?: string;
  slug: string;
  siteTitle: string;
  seoDescription: string;
  publishedAt: string;
  variant: {
    schemaVersion?: 1 | 2;
    template?: { id: TemplateId; revision: number };
    goal?: "SHOP" | "CATALOG" | "INQUIRY";
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

function restoreStorefrontFocus(opener: HTMLElement | null) {
  const visible = (element: HTMLElement) => {
    if (!element.isConnected || element.matches(":disabled")) return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (node.hidden || style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  if (opener && visible(opener)) {
    opener.focus();
    return;
  }
  const alternatives = document.querySelectorAll<HTMLElement>(
    ".lp-storefront [aria-label^='Open cart'], .lp-storefront [data-lp-search], .lp-storefront a[href], .lp-storefront button",
  );
  Array.from(alternatives).find(visible)?.focus();
}

export function PublicLandingPage({ slug: hostnameSlug }: { slug?: string }) {
  const { slug: routeSlug = "" } = useParams();
  const slug = hostnameSlug ?? routeSlug;
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef(cart);
  const setCartNow = useCallback((next: CartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);
  const cartOpener = useRef<HTMLElement | null>(null);
  const optionOpener = useRef<HTMLElement | null>(null);
  const cartPanel = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef(false);
  const [barElement, setBarElement] = useState<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.("(max-width: 767px)").matches ?? false,
  );
  const [publicDialogOpen, setPublicDialogOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return;
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
    queryFn: ({ signal }) =>
      api<PublicLandingPage>(`/public/landing-pages/${encodeURIComponent(slug)}`, { signal }),
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: 30_000,
  });
  const storageKey =
    page.data?.pageId && page.data.businessId
      ? `miss-v-cart:${page.data.businessId}:${page.data.pageId}`
      : cartKey(slug);
  const analytics = useLandingAnalytics(
    slug,
    page.data?.pageId,
    page.data?.analyticsEnabled === true,
  );
  const cartPage = useRef(page.data);
  cartPage.current = page.data;
  const hasPageData = Boolean(page.data);
  useEffect(() => {
    if (!page.data?.nextTransitionAt) return;
    const delay =
      Date.parse(page.data.nextTransitionAt) -
      Date.parse(page.data.serverTime ?? new Date().toISOString());
    const timer = setTimeout(
      () => void page.refetch(),
      Math.min(2147483647, Math.max(50, delay + 100)),
    );
    return () => clearTimeout(timer);
  }, [page.data?.nextTransitionAt, page.data?.serverTime, page.refetch]);
  const now = useCatalogPricingClock(
    (page.data?.catalogItems ?? []).map((item) => item.discount),
    page.data?.serverTime,
    page.dataUpdatedAt,
  );
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
            !item.isAvailable ||
            item.effectiveActive === false ||
            (variant ? !variant.isAvailable : item.variants.length > 0),
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
    if (!hasPageData || !cartPage.current) return;
    try {
      const current = localStorage.getItem(storageKey);
      const legacy = current ? null : localStorage.getItem(cartKey(slug));
      const stored = current ?? legacy;
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      setCartNow(
        Array.isArray(parsed)
          ? parsed.filter((line): line is CartLine =>
              Boolean(
                line &&
                  typeof line.key === "string" &&
                  typeof line.sourceId === "string" &&
                  ["MENU_ITEM", "PRODUCT"].includes(line.sourceType) &&
                  Number.isInteger(line.quantity) &&
                  line.quantity > 0 &&
                  line.quantity <= 99 &&
                  Number.isFinite(line.unitPrice) &&
                  (!legacy ||
                    cartPage.current?.catalogItems.some(
                      (item) =>
                        item.sourceType === line.sourceType && item.sourceId === line.sourceId,
                    )),
              ),
            )
          : [],
      );
    } catch {
      setCartNow([]);
    }
    setCartReadySlug(storageKey);
  }, [storageKey, hasPageData, slug, setCartNow]);
  useEffect(() => {
    if (cartReadySlug !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      /* Keep the current cart usable when storage is unavailable. */
    }
  }, [cart, cartReadySlug, storageKey]);
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
      setCartNow([]);
      setCheckout(false);
      setIdempotencyKey(crypto.randomUUID().replaceAll("-", "_"));
    },
    onSettled: () => {
      pendingRef.current = false;
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        ["PRICES_CHANGED", "PRODUCT_NOT_ACTIVE_NOW"].includes(error.code ?? "")
      ) {
        setReviewedPrices("");
        setPriceNotice(error.message);
        await page.refetch();
      }
      toast.error(error.message);
    },
  });

  function addLine(
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity = 1,
    shopNow = false,
  ): CartAddResult {
    const currentItem = cartPage.current?.catalogItems.find(
      (candidate) =>
        candidate.key === item.key &&
        candidate.sourceType === item.sourceType &&
        candidate.sourceId === item.sourceId,
    );
    if (pendingRef.current || order.isPending)
      return { acceptedQuantity: 0, rejectionReason: "PENDING_SUBMISSION" };
    if (!currentItem) return { acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" };
    const currentVariant =
      variant &&
      currentItem.variants.find((candidate) => candidate.variantId === variant.variantId);
    if (variant && !currentVariant)
      return { acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" };
    const line = lineFromItem(currentItem, currentVariant, now);
    const current = cartRef.current;
    const existing = current.find((candidate) => candidate.key === line.key);
    const result = getCartAddResult({
      item: currentItem,
      variant: currentVariant,
      requestedQuantity: quantity,
      currentQuantity: existing?.quantity ?? 0,
      pending: order.isPending,
    });
    if (!result.acceptedQuantity) return result;
    setSuccess(undefined);
    line.quantity = result.acceptedQuantity;
    const next = existing
      ? current.map((candidate) =>
          candidate.key === line.key
            ? { ...candidate, quantity: candidate.quantity + result.acceptedQuantity }
            : candidate,
        )
      : [...current, line];
    setCartNow(next);
    setChoosing(undefined);
    if (page.data?.variant.schemaVersion !== 2 || shopNow) {
      setSuccess(undefined);
      setCheckout(false);
      captureCartOpener();
      setCartOpen(true);
    }
    return result;
  }

  function handleAdd(
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity = 1,
    shopNow = false,
  ): CartAddResult {
    const currentItem = cartPage.current?.catalogItems.find(
      (candidate) =>
        candidate.key === item.key &&
        candidate.sourceType === item.sourceType &&
        candidate.sourceId === item.sourceId,
    );
    if (!currentItem)
      return {
        acceptedQuantity: 0,
        rejectionReason:
          pendingRef.current || order.isPending ? "PENDING_SUBMISSION" : "UNAVAILABLE_SELECTION",
      };
    if (currentItem.variants.length && !variant) {
      if (
        !pendingRef.current &&
        !order.isPending &&
        currentItem.isAvailable &&
        currentItem.effectiveActive !== false
      ) {
        optionOpener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setChoosing(currentItem);
      }
      return {
        acceptedQuantity: 0,
        rejectionReason:
          pendingRef.current || order.isPending ? "PENDING_SUBMISSION" : "UNAVAILABLE_SELECTION",
      };
    }
    return addLine(item, variant, quantity, shopNow);
  }

  function changeQuantity(key: string, quantity: number) {
    if (pendingRef.current || order.isPending) return;
    const line = cartRef.current.find((candidate) => candidate.key === key);
    if (!line) return;
    if (quantity > line.quantity) {
      const item = cartPage.current?.catalogItems.find(
        (candidate) =>
          candidate.sourceType === line.sourceType && candidate.sourceId === line.sourceId,
      );
      const variant = item?.variants.find((candidate) => candidate.variantId === line.variantId);
      if (
        !item ||
        (line.variantId && !variant) ||
        !getCartAddResult({ item, variant, currentQuantity: line.quantity }).acceptedQuantity
      )
        return;
    }
    setCartNow(
      quantity <= 0
        ? cartRef.current.filter((candidate) => candidate.key !== key)
        : cartRef.current.map((candidate) =>
            candidate.key === key ? { ...candidate, quantity: Math.min(99, quantity) } : candidate,
          ),
    );
  }
  function captureCartOpener() {
    const detailOpener = document.querySelector<HTMLElement>("[data-lp-detail-opener]");
    const active = document.activeElement;
    cartOpener.current =
      detailOpener ??
      (choosing && optionOpener.current
        ? optionOpener.current
        : active instanceof HTMLElement && active !== document.body
          ? active
          : cartOpener.current);
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
    if (!pricedCart.length || !minimumReached || order.isPending || pendingRef.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const fulfillmentMethod = String(values.fulfillmentMethod);
    if (!commerce.fulfillmentMethods.includes(fulfillmentMethod as "PICKUP" | "DELIVERY")) return;
    pendingRef.current = true;
    order.mutate({
      idempotencyKey,
      analyticsSessionId: analytics.sessionId(),
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

  const barVisible =
    mobile &&
    cartCount > 0 &&
    Boolean(
      page.data?.variant.commerce?.orderingEnabled ??
        defaultLandingPageCommerceSettings.orderingEnabled,
    ) &&
    (page.data?.variant.schemaVersion !== 2 || page.data.variant.goal === "SHOP") &&
    !publicDialogOpen &&
    !choosing &&
    !cartOpen;
  useEffect(() => {
    const element = barElement;
    if (!element || !barVisible) {
      setBarHeight(0);
      return;
    }
    const measure = () => setBarHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [barElement, barVisible]);

  if (page.isLoading)
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton cards={4} />
      </div>
    );
  if (!page.data && page.error instanceof ApiError && page.error.status === 404)
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
  if (!page.data)
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center" role="alert">
        <div>
          <h1>Unable to load this page</h1>
          <p>Please check your connection and try again.</p>
          <Button onClick={() => void page.refetch()}>Retry</Button>
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
  if (page.data.variant.schemaVersion === 2 && page.data.variant.goal !== "SHOP")
    commerce.orderingEnabled = false;
  const sections = normalizeLandingSections(page.data.variant);
  const inline =
    page.data.variant.schemaVersion === 2 &&
    commerce.orderingEnabled &&
    sections.some(
      (s) =>
        s.enabled &&
        s.components.some((c) => c.enabled && c.appearance?.orderPresentation === "INLINE_SUMMARY"),
    );
  const contactSection = sections.find(
    (s) =>
      s.enabled &&
      s.components.some(
        (c) => c.enabled && c.id === commerce.contactBlockId && c.type === "CONTACT",
      ),
  );
  const contact = sections
    .filter((s) => s.enabled)
    .flatMap((s) => s.components)
    .find((c) => c.id === commerce.contactBlockId && c.type === "CONTACT" && c.enabled);
  const openCart = () => {
    captureCartOpener();
    setSuccess(undefined);
    setCheckout(false);
    setCartOpen(true);
  };
  async function beginCheckout() {
    analytics.track("checkout_started");
    setCheckingPrices(true);
    const result = await page.refetch();
    setCheckingPrices(false);
    if (result.isError) {
      toast.error("Unable to refresh prices. Please try again.");
      return;
    }
    setReviewedPrices(pricingSignature);
    setPriceNotice("");
    setSuccess(undefined);
    setCheckout(true);
  }
  const barAvailable = mobile && commerce.orderingEnabled && cartCount > 0;
  const showBar = barVisible;
  const themeStyle = landingThemeStyle(page.data.variant.theme);
  const refreshWarning = page.isError ? (
    <div role="status" className="lp-refresh-warning">
      Unable to refresh this page. Your current information is retained.{" "}
      <Button type="button" variant="outline" onClick={() => void page.refetch()}>
        Retry
      </Button>
    </div>
  ) : null;
  const inlineOrder = inline ? (
    <div className="space-y-5">
      <h3>Shopping cart summary</h3>
      <p role="status" className="text-sm">
        {cartCount
          ? `${cartCount} items in your cart`
          : "Your cart is empty. Choose from the collection."}
      </p>
      {pricedCart.map((line) => (
        <div key={line.key} className="border-b pb-4 text-sm">
          <strong>{line.name}</strong>
          {line.variantName && <p>{line.variantName}</p>}
          <p>{formatPeso(line.unitPrice)} each</p>
          {line.unavailable && <p role="alert">Unavailable — remove this item</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              disabled={order.isPending}
              aria-label={`Remove one ${line.name}`}
              onClick={() => changeQuantity(line.key, line.quantity - 1)}
            >
              −
            </Button>
            <span>{line.quantity}</span>
            <Button
              size="icon"
              variant="outline"
              disabled={order.isPending || line.quantity >= 99 || line.unavailable}
              aria-label={`Add one ${line.name}`}
              onClick={() => changeQuantity(line.key, line.quantity + 1)}
            >
              +
            </Button>
            <Button
              variant="ghost"
              disabled={order.isPending}
              onClick={() => changeQuantity(line.key, 0)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <p className="flex justify-between">
        <strong>Subtotal</strong>
        <strong>{formatPeso(cartTotal)}</strong>
      </p>
      {commerce.deliveryFee > 0 && (
        <p className="text-sm">Delivery fee, if selected: {formatPeso(commerce.deliveryFee)}</p>
      )}
      {!minimumReached && (
        <p role="status" className="text-sm">
          Minimum order: {formatPeso(commerce.minimumOrder)}
        </p>
      )}
      {success ? (
        <div role="status">
          <strong>Order received: {success.orderNumber}</strong>
          <p>Total: {formatPeso(success.total)}</p>
        </div>
      ) : checkout && !cartOpen ? (
        <>
          {(pricesNeedReview || priceNotice) && (
            <div role="alert">
              <p>{priceNotice || "Prices changed. Review the updated total."}</p>
              <Button
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
            theme={page.data.variant.schemaVersion === 2 ? page.data.variant.theme : undefined}
            settings={commerce}
            pending={order.isPending || page.isFetching}
            blocked={
              pricesNeedReview ||
              Boolean(priceNotice) ||
              pricedCart.some((l) => l.unavailable) ||
              !minimumReached
            }
            onBack={() => setCheckout(false)}
            onSubmit={submitOrder}
          />
        </>
      ) : (
        <Button
          className="w-full"
          style={{
            background: page.data.variant.theme.primaryColor,
            color: contrastingButtonText(page.data.variant.theme.primaryColor),
            whiteSpace: "normal",
            height: "auto",
            minHeight: 44,
          }}
          disabled={
            !cart.length ||
            !minimumReached ||
            checkingPrices ||
            pricedCart.some((l) => l.unavailable)
          }
          onClick={() => void beginCheckout()}
        >
          {checkingPrices ? "Checking prices…" : "Review and place order"}
        </Button>
      )}
      {contact && (
        <div id={contactSection?.id} className="border-t pt-5">
          {contactSection?.anchor && contactSection.anchor !== contactSection.id && (
            <span id={contactSection.anchor} />
          )}
          <StorefrontBlock
            block={contact}
            context={{
              theme: page.data.variant.theme,
              goal: page.data.variant.goal ?? "SHOP",
              sections,
              catalogItems: page.data.catalogItems ?? [],
            }}
          />
        </div>
      )}
    </div>
  ) : undefined;
  return (
    <>
      {page.data.analyticsEnabled && (
        <aside
          aria-label="Visitor analytics preference"
          className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-b bg-stone-50 px-4 py-2 text-xs text-stone-600"
        >
          <p>
            {analytics.preference === "unknown"
              ? "Allow anonymous visitor statistics to help this business improve its page?"
              : `Visitor statistics: ${analytics.preference === "accepted" ? "allowed" : "declined"}.`}
          </p>
          <div className="flex gap-2">
            {analytics.preference !== "accepted" && (
              <Button size="sm" variant="outline" onClick={() => analytics.choose("accepted")}>
                Allow statistics
              </Button>
            )}
            {analytics.preference !== "declined" && (
              <Button size="sm" variant="outline" onClick={() => analytics.choose("declined")}>
                Decline statistics
              </Button>
            )}
          </div>
        </aside>
      )}
      {!cartOpen && refreshWarning}
      <LandingPageRenderer
        theme={page.data.variant.theme}
        schemaVersion={page.data.variant.schemaVersion}
        template={page.data.variant.template}
        goal={page.data.variant.goal}
        sections={sections}
        menuItems={page.data.menuItems}
        catalogItems={page.data.catalogItems ?? []}
        onAddToCart={commerce.orderingEnabled ? handleAdd : undefined}
        cartPending={order.isPending}
        cartCount={cartCount}
        onOpenCart={openCart}
        onPublicDialogChange={setPublicDialogOpen}
        inlineOrder={inlineOrder}
        contactBlockId={commerce.contactBlockId}
      />
      {commerce.orderingEnabled && (page.data.catalogItems?.length ?? 0) > 0 && (
        <button
          type="button"
          className={`hidden md:flex fixed bottom-5 z-40 items-center gap-3 rounded-full px-5 py-3 font-bold shadow-2xl ${commerce.cartButtonPosition === "BOTTOM_LEFT" ? "left-5" : "right-5"}`}
          style={{
            background: page.data.variant.theme.primaryColor,
            color: contrastingButtonText(page.data.variant.theme.primaryColor),
          }}
          onClick={openCart}
        >
          <Icon icon="solar:cart-large-2-linear" className="size-5" /> {commerce.cartButtonLabel}{" "}
          {cartCount > 0 && cartCount}
        </button>
      )}
      {barAvailable && (
        <>
          {showBar && (
            <div
              className="lp-public-cart-bar-spacer"
              aria-hidden="true"
              style={{ height: barHeight ? barHeight + 16 : undefined }}
            />
          )}
          <div
            className={PUBLIC_CART_BAR_CLASS}
            ref={setBarElement}
            style={{
              ...themeStyle,
              background: undefined,
              color: undefined,
              display: showBar ? undefined : "none",
            }}
            hidden={!showBar}
          >
            <span>
              {cartCount} item{cartCount === 1 ? "" : "s"} · {formatPeso(cartTotal)}
            </span>
            <button type="button" onClick={openCart}>
              View cart
            </button>
          </div>
        </>
      )}

      <Dialog open={Boolean(choosing)} onOpenChange={(value) => !value && setChoosing(undefined)}>
        <DialogContent
          className={`${STOREFRONT_PORTAL_CLASS} lp-commerce-panel`}
          style={themeStyle}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!cartOpen) restoreStorefrontFocus(optionOpener.current);
          }}
        >
          <DialogTitle>Choose {choosing?.name} options</DialogTitle>
          <DialogDescription>
            Select the size, color, or style before adding this item.
          </DialogDescription>
          <div className="mt-5 space-y-3">
            <LiveDiscountCountdown discount={chosenItem?.discount} />
            {chosenItem?.variants.map((variant) => (
              <button
                key={variant.variantId}
                type="button"
                disabled={!variant.isAvailable || !chosenItem.isAvailable}
                className="lp-option flex w-full items-center justify-between rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-45"
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
                  <div className="lp-commerce-price">
                    <CatalogDiscountPrice
                      liveCountdown
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

      <Dialog
        open={cartOpen}
        onOpenChange={(open) => {
          setCartOpen(open);
          if (!open) setCheckout(false);
        }}
      >
        <DialogContent
          className={`${STOREFRONT_PORTAL_CLASS} lp-commerce-panel max-w-xl`}
          ref={cartPanel}
          style={themeStyle}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreStorefrontFocus(cartOpener.current);
          }}
        >
          {refreshWarning}
          {success ? (
            <div className="py-5 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <Icon icon="solar:check-circle-bold" className="size-9" />
              </div>
              <DialogTitle className="mt-5">Order received</DialogTitle>
              <DialogDescription>
                The owner will review your order before confirming it.
              </DialogDescription>
              <div className="lp-checkout-total mt-6 rounded-2xl p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                  Order number
                </p>
                <p className="lp-commerce-price mt-1 text-2xl font-bold">{success.orderNumber}</p>
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
                theme={page.data.variant.schemaVersion === 2 ? page.data.variant.theme : undefined}
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
              <div className="mt-5 space-y-4 lp-cart-lines">
                {pricedCart.map((line) => (
                  <div key={line.key} className="lp-cart-line border-b pb-4">
                    {line.mediaUrl ? (
                      <StoredImage
                        src={line.mediaUrl}
                        alt={line.name}
                        className="lp-cart-line__image size-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="lp-cart-line__image grid size-16 place-items-center rounded-xl">
                        <Icon icon="solar:box-linear" className="size-7" />
                      </div>
                    )}
                    <div className="lp-cart-line__details min-w-0">
                      <p className="font-semibold">{line.name}</p>
                      {line.variantName && (
                        <p className="text-xs text-stone-500">{line.variantName}</p>
                      )}
                      <p className="lp-commerce-price mt-1 text-sm font-bold">
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
                    <div className="lp-cart-line__controls flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Remove one ${line.name}`}
                        disabled={order.isPending}
                        onClick={() => changeQuantity(line.key, line.quantity - 1)}
                      >
                        <Icon icon="solar:minus-circle-linear" />
                      </Button>
                      <span className="w-8 text-center font-semibold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add one ${line.name}`}
                        disabled={order.isPending || line.unavailable || line.quantity >= 99}
                        onClick={() => changeQuantity(line.key, line.quantity + 1)}
                      >
                        <Icon icon="solar:add-circle-linear" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="lp-cart-line__remove"
                      disabled={order.isPending}
                      onClick={() => {
                        changeQuantity(line.key, 0);
                        requestAnimationFrame(() => cartPanel.current?.focus());
                      }}
                    >
                      Remove {line.name}
                      {line.variantName ? ` (${line.variantName})` : ""}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-pink-100 pt-5">
                <span className="font-semibold">Subtotal</span>
                <span className="lp-commerce-price text-xl font-bold">{formatPeso(cartTotal)}</span>
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
                  analytics.track("checkout_started");
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
  theme,
  settings,
  pending,
  blocked,
  onBack,
  onSubmit,
}: {
  subtotal: number;
  theme?: LandingPageTheme;
  settings: LandingPageCommerceSettings;
  pending: boolean;
  blocked: boolean;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY">(
    settings.fulfillmentMethods[0] ?? "PICKUP",
  );
  const validMethod = settings.fulfillmentMethods.includes(method);
  const effectiveMethod = validMethod ? method : settings.fulfillmentMethods[0];
  const [methodNotice, setMethodNotice] = useState("");
  useEffect(() => {
    if (!validMethod) {
      const replacement = settings.fulfillmentMethods[0];
      if (replacement) setMethod(replacement);
      setMethodNotice(
        replacement
          ? `Your previous delivery method is no longer available. ${replacement === "PICKUP" ? "Pickup" : "Delivery"} was selected.`
          : "",
      );
    }
  }, [validMethod, settings.fulfillmentMethods]);
  const deliveryFee = effectiveMethod === "DELIVERY" ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  return (
    <form className="mt-5 space-y-4 lp-checkout-form" onSubmit={onSubmit}>
      {!effectiveMethod ? (
        <p role="status">No fulfillment methods are currently available. Please try again later.</p>
      ) : methodNotice ? (
        <p role="status">{methodNotice}</p>
      ) : null}
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
              className="lp-option rounded-xl border p-3 text-sm font-semibold"
              aria-pressed={effectiveMethod === option}
              style={
                theme && effectiveMethod === option
                  ? {
                      background: theme.primaryColor,
                      color: contrastingButtonText(theme.primaryColor),
                      borderColor: theme.primaryColor,
                    }
                  : undefined
              }
              onClick={() => {
                setMethod(option);
                setMethodNotice("");
              }}
            >
              {option === "PICKUP" ? "Pickup" : "Delivery"}
            </button>
          ))}
        </div>
        <input type="hidden" name="fulfillmentMethod" value={effectiveMethod ?? ""} />
      </div>
      <label htmlFor="checkout-address" hidden={effectiveMethod !== "DELIVERY"}>
        <Label>Delivery address</Label>
        <textarea
          id="checkout-address"
          name="deliveryAddress"
          required={effectiveMethod === "DELIVERY"}
          maxLength={500}
          className="min-h-24 w-full rounded-xl border border-pink-100 p-3 text-sm"
        />
      </label>
      <label htmlFor="checkout-notes">
        <Label>Order notes (optional)</Label>
        <textarea
          id="checkout-notes"
          name="customerNotes"
          maxLength={1000}
          className="min-h-20 w-full rounded-xl border border-pink-100 p-3 text-sm"
        />
      </label>
      <div className="lp-checkout-total rounded-xl p-4 text-sm">
        <div className="flex justify-between text-stone-600">
          <span>Subtotal</span>
          <span>{formatPeso(subtotal)}</span>
        </div>
        {effectiveMethod === "DELIVERY" && (
          <div className="mt-2 flex justify-between text-stone-600">
            <span>Delivery fee</span>
            <span>{formatPeso(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span className="lp-commerce-price">{formatPeso(total)}</span>
        </div>
        {effectiveMethod && (
          <p className="mt-2 text-xs text-stone-500">
            {effectiveMethod === "DELIVERY" ? "Cash on delivery" : "Pay when you pick up the order"}
            . Submitting does not charge you online.
          </p>
        )}
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
        <Button
          type="submit"
          className="flex-1"
          style={
            theme
              ? { background: theme.primaryColor, color: contrastingButtonText(theme.primaryColor) }
              : undefined
          }
          disabled={pending || blocked || !effectiveMethod}
        >
          {pending ? "Submitting..." : "Place order"}
        </Button>
      </div>
    </form>
  );
}
