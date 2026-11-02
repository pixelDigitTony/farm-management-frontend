import { useCallback, useEffect, useRef, useState } from "react";
import type { StorefrontAddToCart } from "@/lib/landing-page/cart-add";
import { landingActionInk, landingThemeStyle } from "@/lib/landing-page/theme";
import type {
  LandingCatalogItem,
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
  onAddToCart?: StorefrontAddToCart;
  cartCount?: number;
  cartPending?: boolean;
  onOpenCart?: () => void;
  onPublicDialogChange?: (open: boolean) => void;
  inlineOrder?: React.ReactNode;
  contactBlockId?: string;
  selectedId?: string;
  onSelect?: (id: string, sectionId: string) => void;
};
export function LandingPageRenderer(props: LandingRendererProps) {
  const { theme, sections, catalogItems = [], mode = "PUBLIC", goal = "SHOP" } = props;
  const [highlight, setHighlight] = useState("");
  const dialogs = useRef(new Set<string>());
  const reported = useRef(false);
  const callback = useRef(props.onPublicDialogChange);
  callback.current = props.onPublicDialogChange;
  const registerDialog = useCallback((id: string, open: boolean) => {
    if (open) {
      dialogs.current.add(id);
      if (!reported.current) {
        reported.current = true;
        callback.current?.(true);
      }
    } else {
      dialogs.current.delete(id);
      queueMicrotask(() => {
        if (!dialogs.current.size && reported.current) {
          reported.current = false;
          callback.current?.(false);
        }
      });
    }
  }, []);
  useEffect(
    () => () => {
      dialogs.current.clear();
      if (reported.current) {
        reported.current = false;
        callback.current?.(false);
      }
    },
    [],
  );
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
    cartPending: props.cartPending,
    onOpenCart: props.onOpenCart,
    registerDialog,
    templateId: props.template?.id,
    onAdd: mode === "EDIT" ? undefined : props.onAddToCart,
    inlineOrder: props.inlineOrder,
    highlightKey: highlight,
    onHighlight: setHighlight,
  };
  const style = landingThemeStyle(theme);
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
            "--lp-action-ink": block.buttonTextColor ?? landingActionInk(theme.primaryColor),
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
                tabIndex={section.maxHeight ? 0 : undefined}
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
