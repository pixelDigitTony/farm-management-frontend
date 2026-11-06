import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogDiscountPrice } from "@/components/CatalogDiscountPrice";
import { StoredImage } from "@/components/StoredImage";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice } from "@/lib/catalog-discounts";
import {
  landingActionInk as contrastingButtonText,
  landingThemeStyle,
  STOREFRONT_PORTAL_CLASS,
} from "@/lib/landing-page/theme";
import { displayDay, myDayStorageKey, type PublicMyDay } from "@/lib/my-day";
import type { LandingCatalogItem, LandingPageTheme } from "@/types/landing-page";

type StoryProps = {
  campaign: PublicMyDay;
  items: LandingCatalogItem[];
  theme: LandingPageTheme;
  now?: number;
  onAction?: (item: LandingCatalogItem) => void;
  actionLabel?: string;
};
export function MyDayStory({
  campaign,
  items,
  theme,
  now = Date.now(),
  onAction,
  actionLabel = "View product",
}: StoryProps) {
  const eligible = campaign.productKeys.flatMap(
    (key) => items.find((item) => item.key === key) ?? [],
  );
  const [selected, setSelected] = useState(campaign.productKeys[0]);
  const previousOrder = useRef(campaign.productKeys);
  useEffect(() => {
    if (!campaign.productKeys.includes(selected ?? "")) {
      const index = previousOrder.current.indexOf(selected ?? "");
      const next = previousOrder.current
        .slice(index + 1)
        .find((key) => campaign.productKeys.includes(key));
      const previous = previousOrder.current
        .slice(0, Math.max(0, index))
        .reverse()
        .find((key) => campaign.productKeys.includes(key));
      setSelected(next ?? previous ?? campaign.productKeys[0]);
    }
    previousOrder.current = campaign.productKeys;
  }, [campaign.productKeys, selected]);
  const index = Math.max(
    0,
    eligible.findIndex((item) => item.key === selected),
  );
  const item = eligible[index];
  if (!item) return null;
  const price =
    item.variants
      .filter((v) => v.isAvailable)
      .sort(
        (a, b) => effectivePrice(a, now, item.discount) - effectivePrice(b, now, item.discount),
      )[0] ?? item;
  const buttonStyle = {
    backgroundColor: theme.primaryColor,
    color: contrastingButtonText(theme.primaryColor),
    minHeight: 44,
  };
  return (
    <div className="space-y-4 break-words" style={landingThemeStyle(theme)}>
      <div className="aspect-[4/3] max-h-[38dvh] overflow-hidden rounded-xl bg-stone-100">
        <StoredImage
          placeholder="skeleton"
          src={item.mediaUrls[0]}
          alt={item.name}
          className="size-full object-contain"
        />
      </div>
      <div aria-live="polite" aria-atomic="true" className="space-y-2">
        <p className="text-sm">
          {index + 1} of {eligible.length}
        </p>
        <h3 className="text-xl font-semibold">{item.name}</h3>
        <CatalogDiscountPrice
          now={now}
          from={item.variants.length > 0}
          pricing={{ ...price, discount: item.discount }}
        />
        <p className="line-clamp-4 whitespace-pre-wrap text-sm">{item.description}</p>
      </div>
      {onAction && (
        <button
          className="lp-action w-full rounded-xl px-4 py-3 font-semibold"
          style={buttonStyle}
          type="button"
          onClick={() => onAction(item)}
        >
          {actionLabel}
        </button>
      )}
      {eligible.length > 1 && (
        <nav aria-label="My Day products" className="flex justify-between gap-3">
          <button
            type="button"
            className="min-h-11 rounded-xl border px-4 disabled:opacity-40"
            disabled={index === 0}
            onClick={() => setSelected(eligible[index - 1]?.key)}
          >
            Previous
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border px-4 disabled:opacity-40"
            disabled={index === eligible.length - 1}
            onClick={() => setSelected(eligible[index + 1]?.key)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

type Props = StoryProps & {
  businessId: string;
  pageId: string;
  frequency: { timezone: string; localDate: string };
  serverTime: string;
  receivedAt: number;
  fresh: boolean;
  blocked: boolean;
  goal: string;
  contactId?: string;
  orderingEnabled: boolean;
  onAdd: (item: LandingCatalogItem) => void;
  onOpenChange: (open: boolean) => void;
};
export function MyDayDialog(props: Omit<Props, "campaign"> & { campaign: PublicMyDay | null }) {
  const {
    campaign,
    items,
    theme,
    businessId,
    pageId,
    frequency,
    serverTime,
    receivedAt,
    fresh,
    blocked,
  } = props;
  const [opened, setOpened] = useState<string>(),
    [detailKey, setDetailKey] = useState<string>();
  const [time, setTime] = useState(() => Date.parse(serverTime));
  const anchor = useRef({ server: Date.parse(serverTime), monotonic: performance.now() });
  const memory = useRef(""),
    openedAt = useRef(performance.now());
  const launcher = useRef<HTMLButtonElement>(null);
  const handoff = useRef<(() => void) | null>(null);
  const storageKey = myDayStorageKey(businessId, pageId);
  const active =
    campaign &&
    time >= Date.parse(campaign.startsAt) &&
    time < Date.parse(campaign.endsAt) &&
    campaign.productKeys.some((key) => items.some((item) => item.key === key));
  const isOpen = Boolean(active && opened === campaign?.id);
  const day = displayDay(time, frequency.timezone);
  const seen = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) === day || memory.current === day;
    } catch {
      return memory.current === day;
    }
  }, [day, storageKey]);
  useEffect(() => {
    anchor.current = { server: Date.parse(serverTime), monotonic: performance.now() };
    setTime(anchor.current.server);
    if (receivedAt) openedAt.current = performance.now();
  }, [serverTime, receivedAt]);
  useEffect(() => {
    const tick = () =>
      setTime(anchor.current.server + performance.now() - anchor.current.monotonic);
    const timer = setInterval(tick, 250);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) memory.current = event.newValue;
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  useEffect(() => {
    if (opened && (!active || opened !== campaign?.id || blocked)) setOpened(undefined);
    if (detailKey && (!active || !campaign?.productKeys.includes(detailKey) || blocked))
      setDetailKey(undefined);
  }, [active, campaign?.id, campaign?.productKeys, opened, detailKey, blocked]);
  useEffect(() => {
    if (
      !active ||
      !campaign ||
      !Number.isFinite(time) ||
      !fresh ||
      blocked ||
      opened ||
      detailKey ||
      frequency.localDate !== day ||
      seen()
    )
      return;
    if (
      document.visibilityState !== "visible" ||
      performance.now() - openedAt.current < 2000 ||
      performance.now() - anchor.current.monotonic > 35_000
    )
      return;
    const focused = document.activeElement;
    if (
      focused?.matches("input, textarea, select, [contenteditable=true]") ||
      document.querySelector('[role="dialog"], [role="alertdialog"]')
    )
      return;
    setOpened(campaign.id);
  }, [time, active, campaign, fresh, blocked, day, opened, detailKey, frequency.localDate, seen]);
  useEffect(() => {
    if (!isOpen) return;
    memory.current = day;
    try {
      localStorage.setItem(storageKey, day);
    } catch {
      /* In-memory suppression remains available. */
    }
  }, [isOpen, day, storageKey]);
  const report = useRef(props.onOpenChange);
  report.current = props.onOpenChange;
  const hasDialog = isOpen || Boolean(detailKey);
  useEffect(() => {
    report.current(hasDialog);
    return () => report.current(false);
  }, [hasDialog]);
  const detail = detailKey && items.find((item) => item.key === detailKey);
  const detailPricing =
    detail &&
    (detail.variants
      .filter((variant) => variant.isAvailable)
      .sort(
        (a, b) =>
          effectivePrice(a, time, detail.discount) - effectivePrice(b, time, detail.discount),
      )[0] ??
      detail);
  function closeFocus(event: Event) {
    event.preventDefault();
    const action = handoff.current;
    handoff.current = null;
    if (action) {
      action();
      return;
    }
    const target =
      launcher.current ??
      document.querySelector<HTMLElement>(
        ".lp-storefront button, .lp-storefront a[href], main a[href], main button",
      );
    target?.focus();
  }
  function productAction(item: LandingCatalogItem) {
    setOpened(undefined);
    handoff.current = () => {
      if (props.goal === "SHOP" && props.orderingEnabled) props.onAdd(item);
      else if (props.goal === "INQUIRY" && props.contactId) contact(item);
      else setDetailKey(item.key);
    };
  }
  function contact(item: LandingCatalogItem) {
    const destination = document.getElementById(props.contactId ?? "");
    if (!destination) {
      setDetailKey(item.key);
      return;
    }
    destination.scrollIntoView({ behavior: "auto", block: "start" });
    destination.setAttribute("tabindex", "-1");
    destination.setAttribute("aria-label", `Contact about ${item.name}`);
    destination.focus();
  }
  const panel = `${STOREFRONT_PORTAL_CLASS} max-w-xl max-h-[calc(100dvh-2rem)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] [&>button:last-child]:min-h-11 [&>button:last-child]:min-w-11`;
  return (
    <>
      {active && (
        <div className="relative z-30 flex justify-end px-4 py-2" style={landingThemeStyle(theme)}>
          <button
            ref={launcher}
            type="button"
            className="min-h-11 rounded-full border px-5 py-2 font-semibold"
            style={{
              background: theme.primaryColor,
              color: contrastingButtonText(theme.primaryColor),
            }}
            disabled={blocked}
            onClick={() => setOpened(campaign.id)}
          >
            My Day
          </button>
        </div>
      )}
      <Dialog
        open={isOpen}
        onOpenChange={(value) => {
          if (!value) setOpened(undefined);
        }}
      >
        <DialogContent
          className={panel}
          style={landingThemeStyle(theme)}
          onCloseAutoFocus={closeFocus}
        >
          <DialogTitle className="pr-12">{campaign?.heading ?? "My Day"}</DialogTitle>
          <DialogDescription className="mb-4 pr-8">
            {campaign?.description || "Discover our featured products."}
          </DialogDescription>
          {campaign && (
            <MyDayStory
              key={campaign.id}
              campaign={campaign}
              items={items}
              theme={theme}
              now={time}
              actionLabel={
                props.goal === "SHOP" && props.orderingEnabled
                  ? "Choose product / Add to cart"
                  : props.goal === "INQUIRY" && props.contactId
                    ? "Ask about this product"
                    : "View product"
              }
              onAction={productAction}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(value) => {
          if (!value) setDetailKey(undefined);
        }}
      >
        <DialogContent
          className={panel}
          style={landingThemeStyle(theme)}
          onCloseAutoFocus={closeFocus}
        >
          <DialogTitle className="pr-12">{detail ? detail.name : "Product details"}</DialogTitle>
          <DialogDescription>Product details and available options.</DialogDescription>
          {detail && (
            <div className="mt-4 space-y-4">
              <StoredImage
                placeholder="skeleton"
                src={detail.mediaUrls[0]}
                alt={detail.name}
                className="max-h-[35dvh] w-full rounded-xl object-contain"
              />
              <CatalogDiscountPrice
                now={time}
                from={detail.variants.length > 0}
                pricing={{ ...detailPricing, discount: detail.discount }}
              />
              <p className="whitespace-pre-wrap break-words">{detail.description}</p>
              {detail.variants.map((v) => (
                <p key={v.variantId}>
                  {v.name} · {v.isAvailable ? "Available" : "Unavailable"}
                </p>
              ))}
              {props.contactId && (
                <button
                  type="button"
                  className="min-h-11 rounded-xl border px-4"
                  onClick={() => {
                    setDetailKey(undefined);
                    handoff.current = () => contact(detail);
                  }}
                >
                  Contact about {detail.name}
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
