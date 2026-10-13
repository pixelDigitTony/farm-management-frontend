import { m, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { CatalogDiscountPrice } from "@/components/CatalogDiscountPrice";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice, useCatalogPricingClock } from "@/lib/catalog-discounts";
import pack from "@/lib/landing-page/assets.json";
import type {
  ActionTarget,
  BackgroundSettings,
  LandingCatalogItem,
  LandingCatalogVariant,
  LandingGoal,
  LandingPageComponent,
  LandingPageSection,
  LandingPageTheme,
  MediaAsset,
} from "@/types/landing-page";
import { LandingBackground } from "../Background";
import { LandingIcon as Icon } from "../LandingIcon";
import {
  contrastingButtonText,
  LandingPageComponentView as LegacyBlock,
} from "../LegacyLandingRenderer";
import { DepthPlane, useLandingMotion } from "../motion/LandingMotion";
import { ResponsiveImage } from "../ResponsiveImage";

export type StorefrontContext = {
  theme: LandingPageTheme;
  goal: LandingGoal;
  sections: LandingPageSection[];
  catalogItems: LandingCatalogItem[];
  cartCount?: number;
  onOpenCart?: () => void;
  onAdd?: (
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity?: number,
    shopNow?: boolean,
  ) => void;
  inlineOrder?: React.ReactNode;
  background?: BackgroundSettings;
  primaryHero?: boolean;
  onHighlight?: (key: string) => void;
  highlightKey?: string;
};
type Block = LandingPageComponent;
export function hasStorefrontContent(block: Block) {
  switch (block.type) {
    case "FEATURES":
    case "SHOWCASE":
    case "FAQ":
      return block.content.items.length > 0;
    case "MEDIA_STORY":
      return block.content.frames.length > 0;
    case "TESTIMONIALS":
      return block.content.entries.some((entry) => entry.enabled);
    case "GALLERY":
      return Boolean(block.content.media?.length || block.content.mediaUrls.length);
    default:
      return true;
  }
}
export function actionHref(target: ActionTarget) {
  return target.kind === "SECTION" ? `#${target.sectionId}` : target.url;
}
export function StorefrontAction({
  label,
  target,
  href,
  secondary = false,
  theme,
}: {
  label?: string;
  target?: ActionTarget;
  href?: string;
  secondary?: boolean;
  theme: LandingPageTheme;
}) {
  const url = target ? actionHref(target) : href;
  if (!url || !label) return null;
  return (
    <a
      className={`lp-action${secondary ? " lp-action-secondary" : ""}`}
      href={url}
      style={{
        background: secondary ? "transparent" : theme.primaryColor,
        color: secondary
          ? "inherit"
          : `var(--lp-action-ink, ${contrastingButtonText(theme.primaryColor)})`,
        borderRadius:
          theme.buttonStyle === "PILL" ? "999px" : theme.buttonStyle === "SQUARE" ? "2px" : "8px",
      }}
    >
      {label}
    </a>
  );
}
export function AssetImage({
  media,
  eager = false,
  className,
  style,
  sizes = "(max-width:767px) 100vw, (max-width:1279px) 60vw, 800px",
}: {
  media: MediaAsset;
  eager?: boolean;
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
}) {
  const entry = Object.values(pack.assets).find((a) => a.url === media.url);
  const ratio = {
    AUTO: undefined,
    SQUARE: "1",
    PORTRAIT: "3 / 4",
    LANDSCAPE: "4 / 3",
    WIDE: "16 / 9",
  }[media.aspectRatio];
  return (
    <ResponsiveImage
      mobileSrc={media.mobileUrl}
      className={className}
      src={media.url}
      alt={media.alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      width={entry?.width}
      height={entry?.height}
      srcSet={entry?.sources.map((s) => `${s.url} ${s.width}w`).join(", ")}
      sizes={sizes}
      style={{
        objectPosition: `${media.focalPoint.x * 100}% ${media.focalPoint.y * 100}%`,
        aspectRatio: ratio,
        ...style,
      }}
      onError={(e) => {
        e.currentTarget.classList.add("lp-image-failed");
      }}
    />
  );
}
function mediaFromUrl(url: string, alt: string): MediaAsset {
  return { url, alt, focalPoint: { x: 0.5, y: 0.5 }, aspectRatio: "AUTO" };
}
function Rail({ children, label }: { children: React.ReactNode; label: string }) {
  const root = useRef<HTMLElement>(null);
  return (
    <div className="lp-rail-shell">
      <div className="lp-rail-actions">
        <button
          type="button"
          aria-label={`Previous ${label}`}
          onClick={() =>
            root.current?.scrollBy({
              left: -root.current.clientWidth * 0.8,
              behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          ←
        </button>
        <button
          type="button"
          aria-label={`Next ${label}`}
          onClick={() =>
            root.current?.scrollBy({
              left: root.current.clientWidth * 0.8,
              behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          →
        </button>
      </div>
      <section
        ref={root}
        className="lp-rail"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region needs keyboard focus for its arrow-key navigation.
        tabIndex={0}
        aria-label={label}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            !["ArrowLeft", "ArrowRight"].includes(event.key)
          )
            return;
          event.preventDefault();
          root.current?.scrollBy({
            left: (event.key === "ArrowRight" ? 1 : -1) * root.current.clientWidth * 0.8,
            behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth",
          });
        }}
      >
        {children}
      </section>
    </div>
  );
}
function Header({
  block,
  context,
}: {
  block: Extract<Block, { type: "HEADER" }>;
  context: StorefrontContext;
}) {
  const [open, setOpen] = useState(false);
  const c = block.content;
  return (
    <header className="lp-header">
      {c.navigation.length > 0 && (
        <button
          type="button"
          className="lp-icon-button lp-menu"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
      )}
      <a
        className="lp-brand"
        href={`#${context.sections.find((s) => s.enabled)?.id ?? block.id}`}
        aria-label={`${c.brand} home`}
      >
        {c.logo ? <AssetImage media={c.logo} eager /> : <span>{c.brand}</span>}
        {c.tagline && <small>{c.tagline}</small>}
      </a>
      <nav className="lp-desktop-nav" aria-label="Main navigation">
        {c.navigation.map((a) => (
          <a key={`${actionHref(a.target)}:${a.label}`} href={actionHref(a.target)}>
            {a.label}
          </a>
        ))}
      </nav>
      <div className="lp-header-utilities">
        {c.messagingUrl && (
          <a className="lp-icon-button" href={c.messagingUrl} aria-label="Message the merchant">
            <Icon icon="solar:chat-round-linear" />
          </a>
        )}
        {c.showSearch &&
          context.sections.some(
            (section) =>
              section.enabled &&
              section.components.some(
                (item) => item.enabled && (item.type === "CATALOG" || item.type === "MENU"),
              ),
          ) && (
            <button
              type="button"
              className="lp-icon-button"
              aria-label="Search collection"
              onClick={() => {
                const search = document.querySelector<HTMLInputElement>(
                  ".lp-storefront [data-lp-search]",
                );
                search?.scrollIntoView({ block: "center" });
                search?.focus();
              }}
            >
              <Icon icon="solar:magnifer-linear" />
            </button>
          )}
        {c.showCart && context.goal === "SHOP" && context.onOpenCart && (
          <button
            type="button"
            className="lp-icon-button"
            onClick={context.onOpenCart}
            aria-label={`Open cart, ${context.cartCount ?? 0} items`}
          >
            <Icon icon="solar:bag-4-linear" />
            <span>{context.cartCount ?? 0}</span>
          </button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{c.brand}</DialogTitle>
          <DialogDescription>Explore this collection</DialogDescription>
          <nav className="lp-drawer-nav" aria-label="Mobile navigation">
            {c.navigation.map((a) => (
              <a
                key={`${actionHref(a.target)}:${a.label}`}
                href={actionHref(a.target)}
                onClick={() => setOpen(false)}
              >
                {a.label}
              </a>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
      {c.action && <StorefrontAction {...c.action} theme={context.theme} />}
    </header>
  );
}
function Hero({
  block,
  context,
}: {
  block: Extract<Block, { type: "HERO" }>;
  context: StorefrontContext;
}) {
  const c = block.content;
  const layout = block.appearance?.layout ?? "LEGACY";
  const Heading = context.primaryHero ? "h1" : "h2";
  const { off } = useLandingMotion();
  const layers = c.layers ?? [];
  const media = c.media ?? (c.mediaUrl ? mediaFromUrl(c.mediaUrl, c.title) : undefined);
  const actions = (
    <div className="lp-actions">
      <StorefrontAction label={c.primaryLabel} href={c.primaryUrl} theme={context.theme} />
      <StorefrontAction
        label={c.secondaryLabel}
        href={c.secondaryUrl}
        theme={context.theme}
        secondary
      />
    </div>
  );
  if (layout === "PHOTO_STRIP")
    return (
      <div className="lp-boutique-hero">
        <section
          className="lp-strip"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: This horizontal image strip must be focusable for native keyboard scrolling.
          tabIndex={0}
          aria-label="Featured collection images"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, c.stripMedia?.length ?? 0)}, minmax(0,1fr))`,
          }}
        >
          {(c.stripMedia ?? []).map((media, i) => (
            <AssetImage
              // biome-ignore lint/suspicious/noArrayIndexKey: Media may repeat and the schema has no entry ID.
              key={i}
              media={media}
              eager={context.primaryHero && i === 0}
              sizes="(max-width:767px) 76vw, 25vw"
            />
          ))}
        </section>
        <div className={`lp-promo lp-promo-${block.appearance?.panelPlacement ?? "OVERLAP"}`}>
          <LandingBackground settings={context.background} eager={context.primaryHero} />
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">{c.eyebrow}</p>
            <Heading>{c.title}</Heading>
            {c.body && <p>{c.body}</p>}
            {actions}
          </div>
        </div>
      </div>
    );
  return (
    <div
      className={`lp-hero lp-hero-${layout.toLowerCase()} ${context.background?.mode === "COLOR" ? "lp-hero-flat" : ""}`}
    >
      <LandingBackground settings={context.background} eager={context.primaryHero} />
      <div className="lp-hero-copy">
        <p className="lp-eyebrow">{c.eyebrow}</p>
        <Heading>{c.title}</Heading>
        {c.body && <p>{c.body}</p>}
        {actions}
        {layout === "LANDSCAPE_BANNER" && c.missionText && (
          <p className="lp-mission">{c.missionText}</p>
        )}
      </div>
      {(media || layers.length > 0) && (
        <div className="lp-hero-media">
          {media && (
            <AssetImage media={media} eager={context.primaryHero} className="lp-main-image" />
          )}
          {layers.map((l, i) => (
            <DepthPlane
              key={l.id}
              depth={
                off || block.motion?.preset !== "PARALLAX"
                  ? 0
                  : (l.depth === "FOREGROUND" ? 12 : 8) *
                    (block.motion.intensity === "STANDARD" ? 1 : 0.65)
              }
              className={`lp-layer lp-layer-${l.depth.toLowerCase()} lp-layer-${i}`}
            >
              <AssetImage
                media={l.media}
                eager={context.primaryHero}
                sizes={
                  l.depth === "FOREGROUND"
                    ? "(max-width:767px) 50vw, 25vw"
                    : "(max-width:767px) 90vw, 50vw"
                }
              />
            </DepthPlane>
          ))}
        </div>
      )}
    </div>
  );
}
function MediaStory({
  block,
  context,
}: {
  block: Extract<Block, { type: "MEDIA_STORY" }>;
  context: StorefrontContext;
}) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const { off, small } = useLandingMotion();
  const { scrollYProgress } = useScroll({ target: root, offset: ["start end", "end start"] });
  const clip = useTransform(scrollYProgress, [0.2, 0.7], ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]);
  const frames = block.content.frames;
  const layout = block.appearance?.layout ?? "STORY";
  const staticMedia = off || (small && block.motion?.mobile !== "SUBTLE");
  const stacked = off || small;
  const sticky = block.motion?.preset === "STICKY_STORY" && !off && !small && frames.length > 1;
  const { scrollYProgress: storyProgress } = useScroll({
    target: root,
    offset: ["start start", "end end"],
  });
  useMotionValueEvent(storyProgress, "change", (progress) => {
    if (sticky)
      setActive(Math.min(frames.length - 1, Math.floor(Math.max(0, progress) * frames.length)));
  });
  const contact = context.sections.find(
    (s) => s.enabled && s.components.some((c) => c.enabled && c.type === "CONTACT"),
  );
  if (!frames.length) return null;
  return (
    <div
      ref={root}
      className={`lp-story lp-story-${layout.toLowerCase()} ${sticky ? "lp-story-sticky" : ""} ${stacked ? "lp-story-stacked" : ""}`}
    >
      <div className="lp-story-inner">
        <div className="lp-story-copy">
          <p className="lp-eyebrow">
            {layout === "LOOKBOOK"
              ? "Explore the details"
              : layout === "PORTAL"
                ? "A new perspective"
                : ""}
          </p>
          <h2>{block.content.heading}</h2>
          <p>{block.content.body}</p>
          {block.content.action && (
            <StorefrontAction {...block.content.action} theme={context.theme} />
          )}
          {!stacked && (
            <fieldset className="lp-frame-choices" aria-label="Story images">
              {frames.map((f, i) => (
                <button
                  type="button"
                  key={f.id}
                  aria-pressed={active === i}
                  onClick={() => {
                    setActive(i);
                    if (f.catalogRef)
                      context.onHighlight?.(`${f.catalogRef.sourceType}:${f.catalogRef.sourceId}`);
                  }}
                >
                  {f.caption || `View ${i + 1}`}
                </button>
              ))}
            </fieldset>
          )}
          {sticky && contact && (
            <a className="lp-skip" href={`#${contact.id}`}>
              Skip to contact ↓
            </a>
          )}
        </div>
        {stacked ? (
          <div className="lp-story-frames">
            {frames.map((frame) => (
              <figure key={frame.id}>
                <div className="lp-story-images">
                  <AssetImage media={frame.media} />
                </div>
                {frame.caption && <figcaption>{frame.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <div className="lp-story-images">
            <AssetImage media={frames[active]?.media ?? frames[0]!.media} />
            {layout === "PORTAL" && frames[1] && active === 0 && !staticMedia && (
              <m.div className="lp-portal-plane" style={{ clipPath: clip }}>
                <AssetImage media={frames[1].media} />
              </m.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function Catalog({
  block,
  context,
}: {
  block: Extract<Block, { type: "CATALOG" | "MENU" }>;
  context: StorefrontContext;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<LandingCatalogItem>();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [shop, setShop] = useState(false);
  const [notice, setNotice] = useState("");
  const refs =
    block.type === "CATALOG"
      ? block.content.catalogItemRefs.map((r) => `${r.sourceType}:${r.sourceId}`)
      : block.content.menuItemIds.map((id) => `MENU_ITEM:${id}`);
  const bound = context.catalogItems.filter(
    (i) =>
      (block.type !== "MENU" || i.sourceType === "MENU_ITEM") &&
      (!refs.length || refs.includes(i.key)),
  );
  const now = useCatalogPricingClock(bound.map((i) => i.discount));
  const categories = [...new Set(bound.map((i) => i.category).filter(Boolean))] as string[];
  const shown = bound.filter(
    (i) =>
      (!category || i.category === category) &&
      `${i.name} ${i.description} ${i.category ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const appearance = block.appearance;
  const boutique = appearance?.cardLayout === "BOUTIQUE";
  const rail =
    appearance?.layout === "RAIL" ||
    (!appearance?.layout && !boutique && block.content.displayMode === "HORIZONTAL");
  const current = detail ? context.catalogItems.find((i) => i.key === detail.key) : undefined;
  const variant = current?.variants.find((v) => v.variantId === variantId);
  const enabled = context.goal === "SHOP" && Boolean(context.onAdd);
  const contact = context.sections.find(
    (s) => s.enabled && s.components.some((c) => c.type === "CONTACT" && c.enabled),
  );
  function open(item: LandingCatalogItem, shopNow = false) {
    setDetail(item);
    setVariantId("");
    setQuantity(1);
    setShop(shopNow);
  }
  function add(item: LandingCatalogItem, shopNow = false) {
    if (item.variants.length) {
      open(item, shopNow);
      return;
    }
    context.onAdd?.(item, undefined, 1, shopNow);
    setNotice(`${item.name} added to cart`);
  }
  const cards = shown.map((item) => (
    <article
      key={item.key}
      id={`product-${item.sourceId}`}
      className={`lp-product ${context.highlightKey === item.key ? "lp-product-highlighted" : ""} ${boutique ? "lp-product-boutique" : ""} ${appearance?.cardLayout === "COMPACT" ? "lp-product-compact" : ""}`}
    >
      <div className="lp-product-image">
        {item.mediaUrls[0] && <AssetImage media={mediaFromUrl(item.mediaUrls[0], item.name)} />}
      </div>
      <div className="lp-product-info">
        <p className="lp-eyebrow">{item.category}</p>
        <h3>{item.name}</h3>
        {item.description && !boutique && <p>{item.description}</p>}
        <CatalogDiscountPrice
          now={now}
          liveCountdown
          from={item.variants.length > 0}
          pricing={
            item.variants.length
              ? {
                  ...[...item.variants].sort(
                    (a, b) =>
                      effectivePrice(a, now, item.discount) - effectivePrice(b, now, item.discount),
                  )[0]!,
                  discount: item.discount,
                }
              : item
          }
        />
        {!item.isAvailable && <p>Currently unavailable</p>}
        {enabled && appearance?.showShopNow && (
          <button
            type="button"
            className="lp-action"
            disabled={!item.isAvailable}
            onClick={() => add(item, true)}
          >
            {appearance.shopLabel ?? "Shop now"}
          </button>
        )}
      </div>
      <div className="lp-product-actions">
        {enabled && appearance?.showAddToCart !== false && (
          <button
            type="button"
            className="lp-action"
            disabled={!item.isAvailable}
            onClick={() => add(item)}
          >
            {item.variants.length ? "Choose options" : (appearance?.addLabel ?? "Add to cart")}
          </button>
        )}
        {appearance?.showQuickView !== false && (
          <button
            type="button"
            className="lp-action lp-action-secondary"
            onClick={() => open(item)}
          >
            {enabled ? (appearance?.quickLabel ?? "Quick view") : "View details"}
          </button>
        )}
      </div>
    </article>
  ));
  return (
    <div
      className={`lp-catalog ${appearance?.orderPresentation === "INLINE_SUMMARY" && enabled ? "lp-inline-order" : ""}`}
    >
      <div>
        <div className="lp-section-title">
          <h2>{block.content.heading}</h2>
          <p>{block.content.body}</p>
        </div>
        <label className="lp-search">
          Search collection
          <input
            data-lp-search
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
          />
        </label>
        {categories.length > 0 && (
          <nav className="lp-categories" aria-label="Collection categories">
            {["", ...categories].map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c || "All"}
              </button>
            ))}
          </nav>
        )}
        {shown.length ? (
          rail ? (
            <Rail label="products">{cards}</Rail>
          ) : (
            <div className={`lp-products lp-columns-${boutique ? 2 : block.content.columns}`}>
              {cards}
            </div>
          )
        ) : (
          <p className="lp-empty" role="status">
            {bound.length
              ? "No matching items. Try another search or choose All."
              : "Our collection is being updated. Please contact us for details."}
          </p>
        )}
        <p className="lp-announcement" role="status">
          {notice}
        </p>
      </div>
      {appearance?.orderPresentation === "INLINE_SUMMARY" && enabled && context.inlineOrder && (
        <aside className="lp-order-panel">{context.inlineOrder}</aside>
      )}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(undefined)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{current?.name ?? "Item unavailable"}</DialogTitle>
          <DialogDescription>
            {current?.description || "Product details and available options."}
          </DialogDescription>
          {current ? (
            <div className="lp-quick-view">
              {current.mediaUrls[0] && (
                <AssetImage media={mediaFromUrl(current.mediaUrls[0], current.name)} />
              )}
              <div>
                <CatalogDiscountPrice
                  now={now}
                  liveCountdown
                  pricing={{ ...(variant ?? current), discount: current.discount }}
                />
                {current.variants.length > 0 && (
                  <fieldset>
                    <legend>Select an option</legend>
                    {current.variants.map((v) => (
                      <button
                        key={v.variantId}
                        type="button"
                        disabled={!v.isAvailable}
                        className="lp-option"
                        aria-pressed={variantId === v.variantId}
                        onClick={() => setVariantId(v.variantId)}
                      >
                        {v.name} — {v.isAvailable ? "Available" : "Unavailable"}
                      </button>
                    ))}
                  </fieldset>
                )}
                {enabled ? (
                  <>
                    <label className="lp-quantity">
                      Quantity
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="lp-action"
                      disabled={
                        !current.isAvailable ||
                        (current.variants.length > 0 && !variant?.isAvailable) ||
                        !Number.isInteger(quantity) ||
                        quantity < 1 ||
                        quantity > 99
                      }
                      onClick={() => {
                        context.onAdd?.(current, variant, quantity, shop);
                        setNotice(`${current.name} added to cart`);
                        setDetail(undefined);
                      }}
                    >
                      {shop ? "Add and review cart" : "Add to cart"}
                    </button>
                  </>
                ) : (
                  contact && (
                    <StorefrontAction
                      label="Contact us"
                      target={{ kind: "SECTION", sectionId: contact.id }}
                      theme={context.theme}
                    />
                  )
                )}
              </div>
            </div>
          ) : (
            <p>This product is no longer available.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function StorefrontBlock({ block, context }: { block: Block; context: StorefrontContext }) {
  const { mode } = useLandingMotion();
  if (block.type === "HEADER") return <Header block={block} context={context} />;
  if (block.type === "HERO") return <Hero block={block} context={context} />;
  if (block.type === "CATALOG" || block.type === "MENU")
    return <Catalog block={block} context={context} />;
  if (block.type === "MEDIA_STORY") return <MediaStory block={block} context={context} />;
  if (block.type === "CONTACT") {
    const c = block.content;
    return (
      <div className="lp-contact">
        <h2>{c.heading}</h2>
        {c.body && <p>{c.body}</p>}
        <div className="lp-contact-details">
          {c.address && <p>{c.address}</p>}
          {c.hours && <p>{c.hours}</p>}
          {c.phone && <a href={`tel:${c.phone.replace(/[^+\d() .-]/g, "")}`}>{c.phone}</a>}
          {c.email && <a href={`mailto:${encodeURIComponent(c.email)}`}>{c.email}</a>}
        </div>
        <div className="lp-actions">
          {[
            [c.facebookUrl, "Facebook"],
            [c.instagramUrl, "Instagram"],
            [c.mapUrl, "Get directions"],
          ].map(([href, label]) =>
            href ? (
              <StorefrontAction key={label} href={href} label={label} theme={context.theme} />
            ) : null,
          )}
        </div>
      </div>
    );
  }
  if (block.type === "TEXT")
    return (
      <div
        className={`lp-text ${block.appearance?.layout === "SPLIT" ? "lp-text-split" : ""}`}
        style={{ textAlign: block.content.alignment === "CENTER" ? "center" : undefined }}
      >
        <h2>{block.content.heading}</h2>
        <p style={{ whiteSpace: "pre-line" }}>{block.content.body}</p>
      </div>
    );
  if (block.type === "CTA")
    return (
      <div className={`lp-cta ${block.appearance?.layout === "SPLIT" ? "lp-cta-split" : ""}`}>
        <div>
          <h2>{block.content.heading}</h2>
          <p>{block.content.body}</p>
        </div>
        <div className="lp-actions">
          <StorefrontAction
            label={block.content.buttonLabel}
            href={block.content.buttonUrl}
            theme={context.theme}
          />
        </div>
      </div>
    );
  if (block.type === "FEATURES") {
    const cards = block.content.items.map((i) => (
      <article key={i.id}>
        <Icon icon={i.icon} style={{ width: 50, height: 50 }} />
        <h3>{i.title}</h3>
        <p>{i.body}</p>
        {i.action && <StorefrontAction {...i.action} theme={context.theme} />}
      </article>
    ));
    return cards.length ? (
      <div className="lp-features">
        <h2>{block.content.heading}</h2>
        {block.appearance?.layout === "RAIL" ? (
          <Rail label="features">{cards}</Rail>
        ) : (
          <div className="lp-features-grid">{cards}</div>
        )}
      </div>
    ) : mode === "EDIT" ? (
      <p className="lp-empty">Add features in the inspector.</p>
    ) : null;
  }
  if (block.type === "SHOWCASE")
    return block.content.items.length ? (
      <div className="lp-showcase">
        <h2>{block.content.heading}</h2>
        <p>{block.content.body}</p>
        <div
          className={`lp-showcase-grid ${block.appearance?.layout === "OFFERING_PATHS" ? "lp-offering-paths" : ""}`}
        >
          {block.content.items.map((i, index) => (
            <article key={i.id}>
              {block.appearance?.showNumbers && (
                <span className="lp-number">{String(index + 1).padStart(2, "0")}</span>
              )}
              {i.media && <AssetImage media={i.media} />}
              <h3>{i.title}</h3>
              <p>{i.body}</p>
              <dl>
                {i.attributes.map((a) => (
                  <div key={`${a.label}:${a.value}`}>
                    <dt>{a.label}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="lp-actions">
                {i.actions.map((a, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: These stateless actions have no entry ID and may intentionally share a target.
                  <StorefrontAction key={j} {...a} secondary={j > 0} theme={context.theme} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    ) : mode === "EDIT" ? (
      <p className="lp-empty">Add your offerings in the inspector.</p>
    ) : null;
  if (block.type === "TESTIMONIALS") {
    const entries = block.content.entries.filter((e) => e.enabled);
    const cards = entries.map((e) => (
      <figure key={e.id} className="lp-testimonial">
        {e.thumbnail && <AssetImage media={e.thumbnail} />}
        <blockquote>{e.quote}</blockquote>
        <figcaption>
          {e.author}
          {e.rating && (
            <span role="img" aria-label={`${e.rating} out of 5 stars`}>
              {"★".repeat(Math.floor(e.rating))}
            </span>
          )}
        </figcaption>
      </figure>
    ));
    return entries.length ? (
      <div>
        <h2>{block.content.heading}</h2>
        {block.content.displayMode === "RAIL" ? (
          <Rail label="testimonials">{cards}</Rail>
        ) : (
          <div className="lp-showcase-grid">{cards}</div>
        )}
      </div>
    ) : mode === "EDIT" ? (
      <p className="lp-empty">
        Add genuine customer testimonials. Empty testimonials are hidden on your public page.
      </p>
    ) : null;
  }
  if (block.type === "FAQ")
    return block.content.items.length ? (
      <div className="lp-faq">
        <h2>{block.content.heading}</h2>
        {block.content.items.map((i) => (
          <details key={i.id}>
            <summary>{i.question}</summary>
            <p>{i.answer}</p>
          </details>
        ))}
      </div>
    ) : mode === "EDIT" ? (
      <p className="lp-empty">Add questions and answers in the inspector.</p>
    ) : null;
  if (block.type === "GALLERY") {
    const media = block.content.media?.length
      ? block.content.media
      : block.content.mediaUrls.map((u) => mediaFromUrl(u, block.content.heading));
    const pictures = media.map((a, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: Gallery media can repeat and has no entry ID; images are stateless.
      <AssetImage key={i} media={a} />
    ));
    return media.length ? (
      <div className="lp-gallery">
        <h2>{block.content.heading}</h2>
        {block.appearance?.layout === "RAIL" ? (
          <Rail label="gallery images">{pictures}</Rail>
        ) : (
          <div
            className={`lp-gallery-grid lp-columns-${block.content.columns} ${block.appearance?.layout === "COLLAGE" ? "lp-gallery-collage" : ""}`}
          >
            {pictures}
          </div>
        )}
      </div>
    ) : mode === "EDIT" ? (
      <p className="lp-empty">Add gallery images in the inspector.</p>
    ) : null;
  }
  if (block.type === "FOOTER")
    return (
      <footer className="lp-footer">
        <p className="lp-footer-statement">{block.content.statement}</p>
        <p className="lp-footer-brand">{block.content.brand}</p>
        <nav aria-label="Footer navigation">
          {block.content.links.map((a) => (
            <a key={`${actionHref(a.target)}:${a.label}`} href={actionHref(a.target)}>
              {a.label}
            </a>
          ))}
        </nav>
        {block.content.legal && <small>{block.content.legal}</small>}
      </footer>
    );
  return <LegacyBlock component={block} theme={context.theme} menuItems={[]} inSection />;
}
