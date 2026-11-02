import type { CSSProperties } from "react";
import type { LandingPageTheme } from "@/types/landing-page";

export const STOREFRONT_PORTAL_CLASS = "lp-storefront-portal";
export const PUBLIC_CART_BAR_CLASS = "lp-public-cart-bar";
export type LandingBackgroundState = "loading" | "ready" | "fallback";

/** The existing V2 renderer's action contrast, shared with detached portal surfaces. */
export function landingActionInk(color: string) {
  const rgb = color
    .slice(1)
    .match(/../g)
    ?.map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }) ?? [0, 0, 0];
  return 0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0) > 0.179
    ? "#151713"
    : "#FFFFFF";
}

export type LandingThemeStyle = CSSProperties & Record<`--lp-${string}`, string>;

/** Use on the renderer and each portal root; portals cannot inherit renderer variables. */
export function landingThemeStyle(theme: LandingPageTheme): LandingThemeStyle {
  const fonts = {
    LEGACY:
      theme.fontStyle === "CLASSIC"
        ? "var(--font-display), Georgia, serif"
        : "var(--font-sans), sans-serif",
    DISPLAY_CONDENSED: '"Arial Narrow", "Franklin Gothic Medium", Impact, sans-serif',
    EDITORIAL_SERIF: 'Georgia, "Times New Roman", serif',
    MODERN_GROTESK: "var(--font-sans), Arial, sans-serif",
  };
  return {
    "--lp-primary": theme.primaryColor,
    "--lp-bg": theme.backgroundColor,
    "--lp-surface": theme.surfaceColor,
    "--lp-ink": theme.textColor,
    "--lp-accent": theme.accentColor ?? theme.primaryColor,
    "--lp-muted": theme.mutedTextColor ?? theme.textColor,
    "--lp-border": theme.borderColor ?? `${theme.primaryColor}30`,
    "--lp-display": fonts[theme.displayFont ?? "LEGACY"],
    "--lp-body":
      theme.bodyFont === "SYSTEM" ? "system-ui, sans-serif" : "var(--font-sans), sans-serif",
    "--lp-max": `${theme.contentMaxWidth ?? 1280}px`,
    "--lp-action-ink": landingActionInk(theme.primaryColor),
    "--lp-button-radius":
      theme.buttonStyle === "PILL" ? "999px" : theme.buttonStyle === "SQUARE" ? "2px" : "8px",
    fontFamily:
      theme.bodyFont === "SYSTEM" ? "system-ui, sans-serif" : "var(--font-sans), sans-serif",
    background: theme.backgroundColor,
    color: theme.textColor,
  };
}
