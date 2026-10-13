import { useState } from "react";
import type {
  LandingCatalogItem,
  LandingCatalogVariant,
  LandingGoal,
  LandingMenuItem,
  LandingPageComponent,
  LandingPageSection,
  LandingPageTheme,
  TemplateId,
} from "@/types/landing-page";
import { LandingBackground } from "./Background";
import {
  hasStorefrontContent,
  StorefrontBlock,
  type StorefrontContext,
} from "./blocks/StorefrontBlocks";
import { LandingPageRenderer as LegacyRenderer, sectionScrollStyle } from "./LegacyLandingRenderer";
import { LandingMotionProvider, MotionBlock, type RenderMode } from "./motion/LandingMotion";
import "./storefront.css";

export {
  contrastingButtonText,
  LandingPageComponentView,
  sectionScrollStyle,
} from "./LegacyLandingRenderer";
export type LandingRendererProps = {
  theme: LandingPageTheme;
  sections: LandingPageSection[];
  menuItems: LandingMenuItem[];
  catalogItems?: LandingCatalogItem[];
  schemaVersion?: 1 | 2;
  template?: { id: TemplateId; revision: number };
  goal?: LandingGoal;
  mode?: RenderMode;
  compact?: boolean;
  onAddToCart?: (
    item: LandingCatalogItem,
    variant?: LandingCatalogVariant,
    quantity?: number,
    shopNow?: boolean,
  ) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  inlineOrder?: React.ReactNode;
  contactBlockId?: string;
  selectedId?: string;
  onSelect?: (id: string, sectionId: string) => void;
};
export function LandingPageRenderer(props: LandingRendererProps) {
  const { theme, sections, catalogItems = [], mode = "PUBLIC", goal = "SHOP" } = props;
  const [highlight, setHighlight] = useState("");
  if (props.schemaVersion !== 2) return <LegacyRenderer {...props} />;
  const firstHero = sections
    .filter((s) => s.enabled)
    .flatMap((s) => s.components.filter((c) => c.enabled))
    .find((c) => c.type === "HERO")?.id;
  const first = sections
    .filter((s) => s.enabled)
    .flatMap((s) => s.components.filter((c) => c.enabled))[0]?.id;
  const hasInline =
    goal === "SHOP" &&
    Boolean(props.inlineOrder) &&
    sections.some(
      (s) =>
        s.enabled &&
        s.components.some((c) => c.enabled && c.appearance?.orderPresentation === "INLINE_SUMMARY"),
    );
  const context: StorefrontContext = {
    theme,
    goal,
    sections,
    catalogItems,
    cartCount: props.cartCount,
    onOpenCart: props.onOpenCart,
    onAdd: mode === "EDIT" ? undefined : props.onAddToCart,
    inlineOrder: props.inlineOrder,
    highlightKey: highlight,
    onHighlight: setHighlight,
  };
  const fonts = {
    LEGACY:
      theme.fontStyle === "CLASSIC"
        ? "var(--font-display), Georgia, serif"
        : "var(--font-sans), sans-serif",
    DISPLAY_CONDENSED: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif',
    EDITORIAL_SERIF: 'Georgia, "Times New Roman", serif',
    MODERN_GROTESK: "var(--font-sans), Arial, sans-serif",
  };
  const style = {
    "--lp-primary": theme.primaryColor,
    "--lp-bg": theme.backgroundColor,
    "--lp-surface": theme.surfaceColor,
    "--lp-ink": theme.textColor,
    "--lp-accent": theme.accentColor ?? theme.primaryColor,
    "--lp-muted": theme.mutedTextColor ?? theme.textColor,
    "--lp-border": theme.borderColor ?? `${theme.primaryColor}30`,
    "--lp-display": fonts[theme.displayFont ?? "LEGACY"],
    fontFamily: theme.bodyFont === "SYSTEM" ? "system-ui, sans-serif" : undefined,
    "--lp-max": `${theme.contentMaxWidth ?? 1280}px`,
    "--lp-action-ink": buttonInk(theme.primaryColor),
    "--lp-button-radius":
      theme.buttonStyle === "PILL" ? "999px" : theme.buttonStyle === "SQUARE" ? "2px" : "8px",
    background: theme.backgroundColor,
    color: theme.textColor,
  } as React.CSSProperties;
  function view(block: LandingPageComponent, section: LandingPageSection) {
    const selected = props.selectedId === block.id;
    const content = (
      <MotionBlock settings={block.motion}>
        <StorefrontBlock
          block={block}
          context={{
            ...context,
            primaryHero: block.id === firstHero,
            background:
              section.background ?? (block.id === firstHero ? theme.background : undefined),
          }}
        />
      </MotionBlock>
    );
    return (
      <div
        key={block.id}
        data-block-id={block.id}
        data-mobile-columns={block.appearance?.mobile?.columns}
        data-mobile-padding={block.appearance?.mobile?.padding?.toLowerCase()}
        style={
          {
            "--lp-action-ink": block.buttonTextColor ?? buttonInk(theme.primaryColor),
            textAlign: block.appearance?.alignment?.toLowerCase() as
              | "left"
              | "center"
              | "right"
              | undefined,
          } as React.CSSProperties
        }
        data-highlighted={highlight ? block.type === "CATALOG" : undefined}
        className={`lp-block lp-width-${block.width.toLowerCase()} lp-layout-${block.appearance?.layout?.toLowerCase() ?? "default"} ${mode === "EDIT" ? "lp-edit-block" : ""} ${selected ? "lp-selected" : ""} ${!block.enabled ? "lp-hidden-block" : ""}`}
        onClickCapture={
          mode === "EDIT"
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onSelect?.(block.id, section.id);
              }
            : undefined
        }
      >
        {!firstHero && block.id === first && (
          <h1 className="lp-sr-only">
            {block.type === "HEADER" ? block.content.brand : section.name}
          </h1>
        )}
        {mode === "EDIT" && (
          <button
            type="button"
            className="lp-select-control"
            aria-label={`Select ${block.type.toLowerCase()} block`}
            onClick={() => props.onSelect?.(block.id, section.id)}
          >
            {block.type.replaceAll("_", " ")}
          </button>
        )}
        {content}
      </div>
    );
  }
  return (
    <LandingMotionProvider mode={mode} level={theme.motionLevel}>
      <div
        className={`lp-storefront lp-template-${props.template?.id ?? "custom"} lp-mode-${mode.toLowerCase()}`}
        style={style}
      >
        {sections
          .filter((s) => mode === "EDIT" || s.enabled)
          .map((section) => {
            const blocks = section.components
              .filter((c) => mode === "EDIT" || c.enabled)
              .filter((c) => mode === "EDIT" || hasStorefrontContent(c))
              .filter((c) => !hasInline || mode === "EDIT" || c.id !== props.contactBlockId);
            if (!blocks.length)
              return (
                <div key={section.id} id={section.id}>
                  {section.anchor && section.anchor !== section.id && <span id={section.anchor} />}
                </div>
              );
            return (
              <section
                key={section.id}
                id={section.id}
                aria-label={section.name}
                className={`lp-section lp-padding-${section.padding.toLowerCase()} lp-gap-${section.gap.toLowerCase()} lp-section-${section.layoutVariant?.toLowerCase() ?? "default"} ${!section.enabled ? "lp-hidden-block" : ""}`}
                data-mobile-padding={section.mobile?.padding.toLowerCase()}
                data-mobile-gap={section.mobile?.gap.toLowerCase()}
                style={{
                  background: section.backgroundColor || undefined,
                  color: section.textColor || undefined,
                  ...sectionScrollStyle(section),
                }}
              >
                {section.background && !blocks.some((c) => c.type === "HERO") && (
                  <LandingBackground settings={section.background} />
                )}
                {section.anchor && section.anchor !== section.id && <span id={section.anchor} />}
                <div
                  className={`lp-section-content lp-content-${section.contentWidth.toLowerCase()}`}
                >
                  <MotionBlock settings={section.motion}>
                    <div className="lp-block-grid">{blocks.map((c) => view(c, section))}</div>
                  </MotionBlock>
                </div>
              </section>
            );
          })}
      </div>
    </LandingMotionProvider>
  );
}
function buttonInk(color: string) {
  const rgb = color
    .slice(1)
    .match(/../g)
    ?.map((n) => {
      const c = parseInt(n, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) ?? [0, 0, 0];
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]! > 0.179 ? "#151713" : "#FFFFFF";
}
