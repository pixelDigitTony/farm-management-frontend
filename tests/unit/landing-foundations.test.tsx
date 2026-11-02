import { render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";
import { getCartAddResult } from "@/lib/landing-page/cart-add";
import {
  landingActionInk,
  landingThemeStyle,
  STOREFRONT_PORTAL_CLASS,
} from "@/lib/landing-page/theme";
import type { LandingCatalogItem, LandingPageTheme } from "@/types/landing-page";

const theme: LandingPageTheme = {
  primaryColor: "#234A34",
  backgroundColor: "#FFF9EF",
  surfaceColor: "#FFFFFF",
  textColor: "#1D2820",
  fontStyle: "CLASSIC",
  buttonStyle: "PILL",
  displayFont: "EDITORIAL_SERIF",
  bodyFont: "SYSTEM",
};
const item: LandingCatalogItem = {
  key: "PRODUCT:plain",
  sourceType: "PRODUCT",
  sourceId: "plain",
  name: "Plain product",
  description: "",
  productType: "FARM_PRODUCT",
  mediaUrls: [],
  price: "100",
  variants: [],
  isAvailable: true,
  isFeatured: false,
};

describe("storefront theme foundations", () => {
  it("carries identical readable theme tokens and fonts into detached portal content", () => {
    const style = landingThemeStyle(theme);
    render(
      <div data-testid="renderer" style={style}>
        {createPortal(
          <div data-testid="portal" className={STOREFRONT_PORTAL_CLASS} style={style} />,
          document.body,
        )}
      </div>,
    );
    const portal = screen.getByTestId("portal");
    expect(screen.getByTestId("renderer")).not.toContainElement(portal);
    for (const property of [
      "--lp-primary",
      "--lp-action-ink",
      "--lp-display",
      "--lp-body",
      "--lp-button-radius",
    ])
      expect(portal.style.getPropertyValue(property)).toBe(
        screen.getByTestId("renderer").style.getPropertyValue(property),
      );
    expect(portal.style.fontFamily).toBe("system-ui, sans-serif");
    expect(style["--lp-action-ink"]).toBe("#FFFFFF");
    expect(landingActionInk("#FFFFFF")).toBe("#151713");
  });
  it("preserves legacy token defaults and explicitly carries the app body font", () => {
    const style = landingThemeStyle({ ...theme, bodyFont: undefined, displayFont: undefined });
    expect(style["--lp-display"]).toBe("var(--font-display), Georgia, serif");
    expect(style["--lp-border"]).toBe("#234A3430");
    expect(style.fontFamily).toBe("var(--font-sans), sans-serif");
    expect(landingThemeStyle({ ...theme, buttonStyle: "SQUARE" })["--lp-button-radius"]).toBe(
      "2px",
    );
  });
});

describe("accepted cart additions", () => {
  it("reports full, partial and capped additions from the actual current line quantity", () => {
    expect(getCartAddResult({ item, requestedQuantity: 2 })).toEqual({
      acceptedQuantity: 2,
      rejectionReason: null,
    });
    expect(getCartAddResult({ item, requestedQuantity: 5, currentQuantity: 97 })).toEqual({
      acceptedQuantity: 2,
      rejectionReason: "QUANTITY_LIMIT",
    });
    expect(getCartAddResult({ item, currentQuantity: 99 })).toEqual({
      acceptedQuantity: 0,
      rejectionReason: "QUANTITY_LIMIT",
    });
  });
  it("rejects pending submission without claiming success, including unavailable items", () => {
    expect(getCartAddResult({ item: { ...item, isAvailable: false }, pending: true })).toEqual({
      acceptedQuantity: 0,
      rejectionReason: "PENDING_SUBMISSION",
    });
  });
  it("rejects inactive items, missing/foreign options and options removed by refreshed data", () => {
    const variant = {
      variantId: "linen",
      name: "Linen",
      attributes: [],
      price: "120",
      isAvailable: true,
    };
    const withOptions = { ...item, variants: [variant] };
    for (const result of [
      getCartAddResult({ item: { ...item, effectiveActive: false } }),
      getCartAddResult({ item: withOptions }),
      getCartAddResult({ item: withOptions, variant: { ...variant, variantId: "foreign" } }),
      getCartAddResult({
        item: { ...withOptions, variants: [{ ...variant, isAvailable: false }] },
        variant,
      }),
      getCartAddResult({ item, variant }),
    ])
      expect(result).toEqual({ acceptedQuantity: 0, rejectionReason: "UNAVAILABLE_SELECTION" });
    expect(getCartAddResult({ item: withOptions, variant })).toEqual({
      acceptedQuantity: 1,
      rejectionReason: null,
    });
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid requested quantity %s",
    (requestedQuantity) => {
      expect(getCartAddResult({ item, requestedQuantity })).toEqual({
        acceptedQuantity: 0,
        rejectionReason: "QUANTITY_LIMIT",
      });
    },
  );
});
