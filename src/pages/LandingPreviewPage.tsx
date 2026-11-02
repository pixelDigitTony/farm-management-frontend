import { useCallback, useEffect, useRef, useState } from "react";
import * as v from "valibot";
import type { PreviewPayload } from "@/components/landing-page/editor/PreviewFrame";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice } from "@/lib/catalog-discounts";
import { type CartAddResult, getCartAddResult } from "@/lib/landing-page/cart-add";
import { landingPageVariantUpdateSchema } from "@/lib/landing-page/schema";
import { landingThemeStyle, STOREFRONT_PORTAL_CLASS } from "@/lib/landing-page/theme";
import { formatPeso } from "@/lib/utils";
import type { LandingCatalogItem, LandingCatalogVariant } from "@/types/landing-page";

function restoreStorefrontFocus(opener: HTMLElement | null, preview: HTMLElement | null) {
  const visible = (element: HTMLElement) => {
    if (
      !element.isConnected ||
      element.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]') ||
      element.closest("[inert]")
    )
      return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (node.hidden || style.display === "none" || style.visibility !== "visible") return false;
    }
    return true;
  };
  const alternatives = [
    ".lp-storefront [aria-label^='Open cart']",
    ".lp-storefront [data-lp-search]",
    ".lp-storefront a[href], .lp-storefront button",
  ].flatMap((selector) => Array.from(preview?.querySelectorAll<HTMLElement>(selector) ?? []));
  for (const candidate of [opener && preview?.contains(opener) ? opener : null, ...alternatives]) {
    if (!candidate || !visible(candidate)) continue;
    candidate.focus();
    if (document.activeElement === candidate) return;
  }
  preview?.focus();
}

export function LandingPreviewPage() {
  const [payload, setPayload] = useState<PreviewPayload>();
  const [cart, setCart] = useState<
    Array<{ key: string; name: string; quantity: number; price: number }>
  >([]);
  const cartRef = useRef(cart);
  const setCartNow = useCallback((next: typeof cart) => {
    cartRef.current = next;
    setCart(next);
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  const preview = useRef<HTMLElement>(null);
  const captureOpener = () => {
    const detail = document.querySelector<HTMLElement>("[data-lp-detail-opener]");
    const active = document.activeElement;
    opener.current =
      detail ??
      (active instanceof HTMLElement && active !== document.body ? active : opener.current);
  };
  const openCart = () => {
    captureOpener();
    setOpen(true);
  };
  const [open, setOpen] = useState(false);
  const nonce = new URLSearchParams(location.search).get("nonce");
  useEffect(() => {
    if (!nonce || window.parent === window) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.nonce !== nonce ||
        event.data.type !== "LP_DOCUMENT"
      )
        return;
      const candidate = event.data.payload as PreviewPayload;
      if (
        !candidate?.draft ||
        !Array.isArray(candidate.catalogItems) ||
        !Array.isArray(candidate.menuItems) ||
        !["EDIT", "PREVIEW"].includes(candidate.mode)
      )
        return;
      // Edits may temporarily contain an empty required field. Keep the last valid preview.
      const parsed = v.safeParse(landingPageVariantUpdateSchema, candidate.draft);
      if (!parsed.success) return;
      setPayload(candidate);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "LP_READY", nonce }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, [nonce]);
  useEffect(() => {
    if (!payload?.draft._id) return;
    setCartNow([]);
    setOpen(false);
  }, [payload?.draft._id, setCartNow]);
  if (!payload) return <p className="p-8 text-sm text-stone-500">Preparing your preview…</p>;
  function add(
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity = 1,
    shop = false,
  ): CartAddResult {
    const currentItem = payload?.catalogItems.find(
      (candidate) =>
        candidate.key === item.key &&
        candidate.sourceType === item.sourceType &&
        candidate.sourceId === item.sourceId,
    );
    if (!currentItem) return { acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" };
    const currentVariant =
      variant &&
      currentItem.variants.find((candidate) => candidate.variantId === variant.variantId);
    if (variant && !currentVariant)
      return { acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" };
    const key = `${currentItem.key}:${currentVariant?.variantId ?? ""}`;
    const current = cartRef.current;
    const found = current.find((i) => i.key === key);
    const result = getCartAddResult({
      item: currentItem,
      variant: currentVariant,
      requestedQuantity: quantity,
      currentQuantity: found?.quantity ?? 0,
    });
    if (!result.acceptedQuantity) return result;
    const next = found
      ? current.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + result.acceptedQuantity } : i,
        )
      : [
          ...current,
          {
            key,
            name: `${currentItem.name}${currentVariant ? ` · ${currentVariant.name}` : ""}`,
            price: effectivePrice(currentVariant ?? currentItem, Date.now(), currentItem.discount),
            quantity: result.acceptedQuantity,
          },
        ];
    setCartNow(next);
    if (shop) openCart();
    return result;
  }
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  const summary = (
    <div>
      <h3>Preview cart</h3>
      <p className="text-sm">Orders are disabled in preview.</p>
      {cart.map((i) => (
        <p key={i.key}>
          {i.name} × {i.quantity} — {formatPeso(i.price * i.quantity)}
        </p>
      ))}
      <button type="button" className="lp-action" onClick={openCart}>
        Review preview cart
      </button>
    </div>
  );
  return (
    <section
      ref={preview}
      aria-label="Storefront preview"
      tabIndex={-1}
      onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        const block = (event.target as HTMLElement).closest<HTMLElement>("[data-block-id]");
        if (payload.mode === "EDIT" && block) {
          event.preventDefault();
          event.stopPropagation();
          const section = payload.draft.sections.find((s) =>
            s.components.some((c) => c.id === block.dataset.blockId),
          );
          window.parent.postMessage(
            { type: "LP_SELECT", nonce, id: block.dataset.blockId, sectionId: section?.id },
            location.origin,
          );
          return;
        }
        if (link && payload.mode === "PREVIEW" && !link.getAttribute("href")?.startsWith("#")) {
          event.preventDefault();
          window.open(link.href, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <LandingPageRenderer
        {...payload.draft}
        theme={
          payload.motionOff ? { ...payload.draft.theme, motionLevel: "OFF" } : payload.draft.theme
        }
        catalogItems={payload.catalogItems}
        menuItems={payload.menuItems}
        mode={payload.mode}
        selectedId={payload.selectedId}
        onSelect={(id, sectionId) =>
          window.parent.postMessage({ type: "LP_SELECT", nonce, id, sectionId }, location.origin)
        }
        cartCount={count}
        onOpenCart={openCart}
        onAddToCart={payload.draft.commerce.orderingEnabled ? add : undefined}
        inlineOrder={summary}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`${STOREFRONT_PORTAL_CLASS} lp-commerce-panel`}
          style={landingThemeStyle(payload.draft.theme)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreStorefrontFocus(opener.current, preview.current);
          }}
        >
          <DialogTitle>Preview cart</DialogTitle>
          <DialogDescription>
            This is a temporary preview. Orders cannot be submitted.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            {cart.length ? (
              cart.map((i) => (
                <div key={i.key}>
                  <p>
                    {i.name} × {i.quantity}
                  </p>
                  <p>{formatPeso(i.price * i.quantity)}</p>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setCartNow(cartRef.current.filter((line) => line.key !== i.key))}
                  >
                    Remove {i.name}
                  </button>
                </div>
              ))
            ) : (
              <p>Your preview cart is empty.</p>
            )}
            <strong>Total: {formatPeso(cart.reduce((n, i) => n + i.price * i.quantity, 0))}</strong>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
