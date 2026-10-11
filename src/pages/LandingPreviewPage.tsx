import { useEffect, useState } from "react";
import * as v from "valibot";
import type { PreviewPayload } from "@/components/landing-page/editor/PreviewFrame";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice } from "@/lib/catalog-discounts";
import { landingPageVariantUpdateSchema } from "@/lib/landing-page/schema";
import { formatPeso } from "@/lib/utils";
import type { LandingCatalogItem, LandingCatalogVariant } from "@/types/landing-page";
export function LandingPreviewPage() {
  const [payload, setPayload] = useState<PreviewPayload>();
  const [cart, setCart] = useState<
    Array<{ key: string; name: string; quantity: number; price: number }>
  >([]);
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
    setCart([]);
    setOpen(false);
  }, [payload?.draft._id]);
  if (!payload) return <p className="p-8 text-sm text-stone-500">Preparing your preview…</p>;
  function add(
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity = 1,
    shop = false,
  ) {
    const key = `${item.key}:${variant?.variantId ?? ""}`;
    setCart((current) => {
      const found = current.find((i) => i.key === key);
      return found
        ? current.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i,
          )
        : [
            ...current,
            {
              key,
              name: `${item.name}${variant ? " · " + variant.name : ""}`,
              price: effectivePrice(variant ?? item, Date.now(), item.discount),
              quantity,
            },
          ];
    });
    if (shop) setOpen(true);
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
      <button type="button" className="lp-action" onClick={() => setOpen(true)}>
        Review preview cart
      </button>
    </div>
  );
  return (
    <div
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
        onOpenCart={() => setOpen(true)}
        onAddToCart={payload.draft.commerce.orderingEnabled ? add : undefined}
        inlineOrder={summary}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
                    onClick={() => setCart((c) => c.filter((line) => line.key !== i.key))}
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
    </div>
  );
}
