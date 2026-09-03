import { Icon } from "@iconify/react";
import { useRef } from "react";
import { CatalogDiscountPrice } from "@/components/CatalogDiscountPrice";
import { effectivePrice, useCatalogClock } from "@/lib/catalog-discounts";
import { getMenuMediaEmbed, getMenuMediaUrls } from "@/lib/google-drive";
import { formatPeso } from "@/lib/utils";
import type {
  LandingCatalogItem,
  LandingMenuItem,
  LandingPageComponent,
  LandingPageDisplayMode,
  LandingPageSection,
  LandingPageTheme,
} from "@/types/landing-page";

type LandingPageRendererProps = {
  theme: LandingPageTheme;
  sections: LandingPageSection[];
  menuItems: LandingMenuItem[];
  catalogItems?: LandingCatalogItem[];
  onAddToCart?: (item: LandingCatalogItem) => void;
  compact?: boolean;
};

function radius(theme: LandingPageTheme) {
  if (theme.buttonStyle === "PILL") return "999px";
  if (theme.buttonStyle === "SQUARE") return "0.25rem";
  return "0.85rem";
}

function ActionLink({
  href,
  children,
  secondary = false,
  theme,
}: {
  href: string;
  children: React.ReactNode;
  secondary?: boolean;
  theme: LandingPageTheme;
}) {
  if (!href || !children) return null;
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center px-5 py-3 text-sm font-bold transition hover:-translate-y-0.5"
      style={{
        borderRadius: radius(theme),
        background: secondary ? "transparent" : theme.primaryColor,
        color: secondary ? theme.textColor : "white",
        border: `1px solid ${secondary ? theme.textColor : theme.primaryColor}`,
      }}
    >
      {children}
    </a>
  );
}

function Media({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  if (!url) return null;
  const embed = getMenuMediaEmbed(url);
  if (embed)
    return (
      <iframe
        src={embed.embedUrl}
        title={title}
        className={`h-full min-h-52 w-full border-0 ${className}`}
        loading="lazy"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    );
  return (
    <img
      src={url}
      alt={title}
      className={`h-full w-full object-cover ${className}`}
      loading="lazy"
    />
  );
}

export function sectionScrollStyle(section: LandingPageSection): React.CSSProperties {
  return section.maxHeight && section.maxHeight > 0
    ? { maxHeight: section.maxHeight, overflowY: "auto", overflowX: "hidden" }
    : {};
}

function CatalogItemsLayout({
  children,
  heading,
  columns,
  displayMode = "VERTICAL",
  previewDevice,
  count,
}: {
  children: React.ReactNode;
  heading: string;
  columns: 2 | 3 | 4;
  displayMode?: LandingPageDisplayMode;
  previewDevice?: "DESKTOP" | "TABLET" | "MOBILE";
  count: number;
}) {
  const track = useRef<HTMLElement>(null);
  const horizontal = displayMode === "HORIZONTAL";
  const previewColumns = Math.min(
    previewDevice === "MOBILE" ? 1 : previewDevice === "TABLET" ? 2 : columns,
    count,
  );
  const gridClass =
    columns === 4
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";
  const carouselClass =
    columns === 4
      ? "lg:auto-cols-[calc((100%_-_3.75rem)/4)]"
      : columns === 3
        ? "lg:auto-cols-[calc((100%_-_2.5rem)/3)]"
        : "lg:auto-cols-[calc((100%_-_1.25rem)/2)]";
  function scroll(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="mt-7 min-w-0">
      {horizontal && count > 1 && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs opacity-65">Swipe or use the arrows to browse.</p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`Previous ${heading} items`}
              className="rounded-full border p-2 hover:opacity-70"
              onClick={() => scroll(-1)}
            >
              <Icon icon="solar:alt-arrow-left-linear" />
            </button>
            <button
              type="button"
              aria-label={`Next ${heading} items`}
              className="rounded-full border p-2 hover:opacity-70"
              onClick={() => scroll(1)}
            >
              <Icon icon="solar:alt-arrow-right-linear" />
            </button>
          </div>
        </div>
      )}
      <section
        ref={track}
        aria-label={horizontal ? `${heading} carousel` : `${heading} items`}
        tabIndex={horizontal ? 0 : undefined}
        className={`grid min-w-0 gap-5 ${horizontal ? `grid-flow-col auto-cols-[85%] snap-x snap-mandatory overflow-x-auto pb-3 ${previewDevice ? "" : `sm:auto-cols-[calc((100%_-_1.25rem)/2)] ${carouselClass}`}` : previewDevice ? "" : gridClass}`}
        style={
          previewDevice
            ? horizontal
              ? {
                  gridAutoColumns:
                    previewDevice === "MOBILE" && count > 1
                      ? "85%"
                      : `calc((100% - ${(previewColumns - 1) * 1.25}rem) / ${previewColumns})`,
                }
              : { gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {children}
      </section>
    </div>
  );
}

function MenuSection({
  component,
  menuItems,
  theme,
  previewDevice,
  inSection,
  catalogItems,
  onAddToCart,
}: {
  component: Extract<LandingPageComponent, { type: "MENU" }>;
  menuItems: LandingMenuItem[];
  theme: LandingPageTheme;
  previewDevice?: "DESKTOP" | "TABLET" | "MOBILE";
  inSection?: boolean;
  catalogItems: LandingCatalogItem[];
  onAddToCart?: (item: LandingCatalogItem) => void;
}) {
  const selected = component.content.menuItemIds
    .map((id) => menuItems.find((item) => item._id === id))
    .filter((item): item is LandingMenuItem => Boolean(item));
  return (
    <section id="menu" className={inSection ? "" : "px-6 py-12 sm:px-10"}>
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold">{component.content.heading}</h2>
        {component.content.body && (
          <p className="mt-3 max-w-2xl opacity-70">{component.content.body}</p>
        )}
        {selected.length ? (
          <CatalogItemsLayout
            heading={component.content.heading}
            columns={component.content.columns}
            displayMode={component.content.displayMode}
            previewDevice={previewDevice}
            count={selected.length}
          >
            {selected.map((item) => {
              const media = getMenuMediaUrls(item)[0];
              const catalogItem = catalogItems.find(
                (candidate) =>
                  candidate.sourceType === "MENU_ITEM" && candidate.sourceId === item._id,
              );
              return (
                <article
                  key={item._id}
                  className="min-w-0 snap-start overflow-hidden border shadow-sm"
                  style={{
                    background: theme.surfaceColor,
                    borderColor: `${theme.primaryColor}25`,
                    borderRadius: "1.25rem",
                  }}
                >
                  {media && (
                    <div className="h-40 overflow-hidden">
                      <Media url={media} title={item.name} />
                    </div>
                  )}
                  <div className="p-5">
                    {item.category && (
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: theme.primaryColor }}
                      >
                        {item.category.replaceAll("_", " ")}
                      </p>
                    )}
                    <h3 className="mt-1 text-lg font-bold">{item.name}</h3>
                    <p className="mt-3 font-bold" style={{ color: theme.primaryColor }}>
                      {formatPeso(item.sellingPricePerServing ?? 0)}
                    </p>
                    {onAddToCart && catalogItem && (
                      <button
                        type="button"
                        className="mt-4 w-full px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: theme.primaryColor, borderRadius: radius(theme) }}
                        disabled={!catalogItem.isAvailable}
                        onClick={() => onAddToCart(catalogItem)}
                      >
                        {catalogItem.isAvailable ? "Add to cart" : "Unavailable"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </CatalogItemsLayout>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm opacity-60">
            Select menu items to feature here.
          </div>
        )}
      </div>
    </section>
  );
}

function CatalogSection({
  component,
  catalogItems,
  theme,
  previewDevice,
  inSection,
  onAddToCart,
}: {
  component: Extract<LandingPageComponent, { type: "CATALOG" }>;
  catalogItems: LandingCatalogItem[];
  theme: LandingPageTheme;
  previewDevice?: "DESKTOP" | "TABLET" | "MOBILE";
  inSection?: boolean;
  onAddToCart?: (item: LandingCatalogItem) => void;
}) {
  const selected = component.content.catalogItemRefs
    .map((reference) =>
      catalogItems.find(
        (item) => item.sourceType === reference.sourceType && item.sourceId === reference.sourceId,
      ),
    )
    .filter((item): item is LandingCatalogItem => Boolean(item));
  const now = useCatalogClock();
  return (
    <section id="products" className={inSection ? "" : "px-6 py-12 sm:px-10"}>
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold">{component.content.heading}</h2>
        {component.content.body && (
          <p className="mt-3 max-w-2xl opacity-70">{component.content.body}</p>
        )}
        {selected.length ? (
          <CatalogItemsLayout
            heading={component.content.heading}
            columns={component.content.columns}
            displayMode={component.content.displayMode}
            previewDevice={previewDevice}
            count={selected.length}
          >
            {selected.map((item) => (
              <article
                key={item.key}
                className="min-w-0 snap-start overflow-hidden border shadow-sm"
                style={{
                  background: theme.surfaceColor,
                  borderColor: `${theme.primaryColor}25`,
                  borderRadius: "1.25rem",
                }}
              >
                {item.mediaUrls[0] && (
                  <div className="h-44 overflow-hidden">
                    <Media url={item.mediaUrls[0]} title={item.name} />
                  </div>
                )}
                <div className="p-5">
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: theme.primaryColor }}
                  >
                    {item.category || item.productType.replaceAll("_", " ")}
                  </p>
                  <h3 className="mt-1 text-lg font-bold">{item.name}</h3>
                  {item.description && (
                    <p className="mt-2 line-clamp-2 text-sm opacity-65">{item.description}</p>
                  )}
                  <div className="mt-3" style={{ color: theme.primaryColor }}>
                    <CatalogDiscountPrice
                      now={now}
                      from={item.variants.length > 0}
                      pricing={
                        item.variants.length
                          ? {
                              ...[...item.variants].sort(
                                (left, right) =>
                                  effectivePrice(left, now, item.discount) -
                                  effectivePrice(right, now, item.discount),
                              )[0],
                              discount: item.discount,
                            }
                          : item
                      }
                    />
                  </div>
                  {onAddToCart && (
                    <button
                      type="button"
                      className="mt-4 w-full px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: theme.primaryColor, borderRadius: radius(theme) }}
                      disabled={!item.isAvailable}
                      onClick={() => onAddToCart(item)}
                    >
                      {item.isAvailable
                        ? item.variants.length
                          ? "Choose options"
                          : "Add to cart"
                        : "Unavailable"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </CatalogItemsLayout>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm opacity-60">
            Select products to feature here.
          </div>
        )}
      </div>
    </section>
  );
}

export function LandingPageComponentView({
  component,
  menuItems,
  catalogItems = [],
  onAddToCart,
  theme,
  previewDevice,
  inSection = false,
}: {
  component: LandingPageComponent;
  menuItems: LandingMenuItem[];
  catalogItems?: LandingCatalogItem[];
  onAddToCart?: (item: LandingCatalogItem) => void;
  theme: LandingPageTheme;
  previewDevice?: "DESKTOP" | "TABLET" | "MOBILE";
  inSection?: boolean;
}) {
  if (component.type === "HERO")
    return (
      <section
        className={`grid min-h-[420px] items-center gap-8 ${inSection ? "" : "px-6 py-14 sm:px-10"} ${previewDevice === "MOBILE" ? "grid-cols-1" : previewDevice ? "grid-cols-2" : "lg:grid-cols-2"}`}
      >
        <div className="mx-auto w-full max-w-xl lg:ml-auto lg:mr-0">
          {component.content.eyebrow && (
            <p
              className="text-xs font-bold uppercase tracking-[.25em]"
              style={{ color: theme.primaryColor }}
            >
              {component.content.eyebrow}
            </p>
          )}
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            {component.content.title}
          </h1>
          {component.content.body && (
            <p className="mt-5 text-lg leading-relaxed opacity-70">{component.content.body}</p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <ActionLink href={component.content.primaryUrl} theme={theme}>
              {component.content.primaryLabel}
            </ActionLink>
            <ActionLink href={component.content.secondaryUrl} theme={theme} secondary>
              {component.content.secondaryLabel}
            </ActionLink>
          </div>
        </div>
        {component.content.mediaUrl ? (
          <div className="min-h-72 overflow-hidden shadow-xl" style={{ borderRadius: "2rem" }}>
            <Media url={component.content.mediaUrl} title={component.content.title} />
          </div>
        ) : (
          <div
            className="grid min-h-72 place-items-center rounded-[2rem] border border-dashed"
            style={{
              borderColor: `${theme.primaryColor}55`,
              background: `${theme.primaryColor}10`,
            }}
          >
            <Icon
              icon="mdi:pig-variant"
              className="size-24"
              style={{ color: `${theme.primaryColor}80` }}
            />
          </div>
        )}
      </section>
    );
  if (component.type === "TEXT")
    return (
      <section
        className={`${inSection ? "" : "px-6 py-12 sm:px-10"} ${component.content.alignment === "CENTER" ? "text-center" : ""}`}
      >
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold">{component.content.heading}</h2>
          <p className="mt-4 whitespace-pre-line leading-7 opacity-75">{component.content.body}</p>
        </div>
      </section>
    );
  if (component.type === "MENU")
    return (
      <MenuSection
        component={component}
        menuItems={menuItems}
        theme={theme}
        previewDevice={previewDevice}
        inSection={inSection}
        catalogItems={catalogItems}
        onAddToCart={onAddToCart}
      />
    );
  if (component.type === "CATALOG")
    return (
      <CatalogSection
        component={component}
        catalogItems={catalogItems}
        theme={theme}
        previewDevice={previewDevice}
        inSection={inSection}
        onAddToCart={onAddToCart}
      />
    );
  if (component.type === "GALLERY")
    return (
      <section className={inSection ? "" : "px-6 py-12 sm:px-10"}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold">{component.content.heading}</h2>
          {component.content.mediaUrls.length ? (
            <div
              className={`mt-7 grid gap-4 ${previewDevice ? "" : component.content.columns === 4 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : component.content.columns === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}
              style={
                previewDevice
                  ? {
                      gridTemplateColumns: `repeat(${previewDevice === "MOBILE" ? 1 : previewDevice === "TABLET" ? 2 : component.content.columns}, minmax(0, 1fr))`,
                    }
                  : undefined
              }
            >
              {component.content.mediaUrls.map((url, index) => (
                <div key={url} className="h-56 overflow-hidden rounded-2xl">
                  <Media url={url} title={`${component.content.heading} ${index + 1}`} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm opacity-60">
              Add public media links to build the gallery.
            </div>
          )}
        </div>
      </section>
    );
  if (component.type === "CONTACT")
    return (
      <section id="contact" className={inSection ? "" : "px-6 py-12 sm:px-10"}>
        <div
          className="mx-auto grid max-w-5xl gap-8 rounded-3xl p-8 sm:grid-cols-2"
          style={{ background: theme.surfaceColor }}
        >
          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: theme.primaryColor }}
            >
              Get in touch
            </p>
            <h2 className="mt-2 text-3xl font-bold">{component.content.heading}</h2>
            <p className="mt-4 opacity-70">{component.content.body}</p>
          </div>
          <div className="space-y-3 text-sm">
            {component.content.address && (
              <p>
                <strong>Address:</strong> {component.content.address}
              </p>
            )}
            {component.content.phone && (
              <p>
                <strong>Phone:</strong>{" "}
                <a href={`tel:${component.content.phone}`}>{component.content.phone}</a>
              </p>
            )}
            {component.content.email && (
              <p>
                <strong>Email:</strong>{" "}
                <a href={`mailto:${component.content.email}`}>{component.content.email}</a>
              </p>
            )}
            {component.content.hours && (
              <p className="whitespace-pre-line">
                <strong>Hours:</strong> {component.content.hours}
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              {component.content.facebookUrl && (
                <a
                  href={component.content.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold"
                  style={{ color: theme.primaryColor }}
                >
                  Facebook
                </a>
              )}
              {component.content.instagramUrl && (
                <a
                  href={component.content.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold"
                  style={{ color: theme.primaryColor }}
                >
                  Instagram
                </a>
              )}
              {component.content.mapUrl && (
                <a
                  href={component.content.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold"
                  style={{ color: theme.primaryColor }}
                >
                  Open map
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  return (
    <section className={`${inSection ? "" : "px-6 py-12 sm:px-10"} text-center`}>
      <div
        className="mx-auto max-w-4xl rounded-3xl px-8 py-12 text-white"
        style={{ background: theme.primaryColor }}
      >
        <h2 className="text-3xl font-bold">{component.content.heading}</h2>
        <p className="mx-auto mt-3 max-w-2xl opacity-85">{component.content.body}</p>
        <div className="mt-6">
          <ActionLink
            href={component.content.buttonUrl}
            theme={{ ...theme, primaryColor: theme.surfaceColor, textColor: "white" }}
          >
            {component.content.buttonLabel}
          </ActionLink>
        </div>
      </div>
    </section>
  );
}

export function LandingPageRenderer({
  theme,
  sections,
  menuItems,
  catalogItems = [],
  onAddToCart,
  compact = false,
}: LandingPageRendererProps) {
  const enabledSections = sections.filter((section) => section.enabled);
  const enabledCount = enabledSections.reduce(
    (count, section) => count + section.components.filter((component) => component.enabled).length,
    0,
  );
  return (
    <div
      className={`min-h-full overflow-hidden ${theme.fontStyle === "CLASSIC" ? "font-display" : "font-sans"}`}
      style={{
        background: theme.backgroundColor,
        color: theme.textColor,
        fontSize: compact ? "0.82rem" : undefined,
      }}
    >
      {enabledSections.map((section) => {
        const components = section.components.filter((component) => component.enabled);
        const widthClass =
          section.contentWidth === "FULL"
            ? "max-w-none"
            : section.contentWidth === "CONTAINED"
              ? "mx-auto max-w-5xl"
              : "mx-auto max-w-7xl";
        const paddingClass =
          section.padding === "NONE"
            ? ""
            : section.padding === "SMALL"
              ? "px-4 py-5 sm:px-6"
              : section.padding === "LARGE"
                ? "px-6 py-16 sm:px-10"
                : "px-5 py-10 sm:px-8";
        const gapClass =
          section.gap === "NONE"
            ? "gap-0"
            : section.gap === "SMALL"
              ? "gap-3"
              : section.gap === "LARGE"
                ? "gap-10"
                : "gap-6";
        return (
          <section
            key={section.id}
            id={section.id}
            aria-label={section.name}
            tabIndex={section.maxHeight ? 0 : undefined}
            style={{
              ...sectionScrollStyle(section),
              background: section.backgroundColor || "transparent",
              color: section.textColor || "inherit",
            }}
          >
            <div className={`${widthClass} ${paddingClass}`}>
              <div className={`grid grid-cols-12 ${gapClass}`}>
                {components.map((component) => (
                  <div
                    key={component.id}
                    className={`min-w-0 ${
                      component.width === "FULL"
                        ? "col-span-12"
                        : component.width === "TWO_THIRDS"
                          ? "col-span-12 md:col-span-8"
                          : component.width === "HALF"
                            ? "col-span-12 md:col-span-6"
                            : "col-span-12 md:col-span-4"
                    }`}
                  >
                    <LandingPageComponentView
                      component={component}
                      menuItems={menuItems}
                      catalogItems={catalogItems}
                      onAddToCart={onAddToCart}
                      theme={theme}
                      inSection
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
      {!enabledCount && (
        <div className="grid min-h-96 place-items-center p-8 text-center opacity-60">
          Add a component to start building your page.
        </div>
      )}
    </div>
  );
}
