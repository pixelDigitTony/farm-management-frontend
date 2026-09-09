import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  contrastingButtonText,
  LandingPageComponentView,
} from "@/components/landing-page/LandingPageRenderer";
import {
  createLandingComponent,
  type LandingCatalogItem,
  type LandingPageTheme,
} from "@/types/landing-page";

const theme: LandingPageTheme = {
  primaryColor: "#ffffff",
  surfaceColor: "#ffffff",
  backgroundColor: "#ffffff",
  textColor: "#222222",
  fontStyle: "MODERN",
  buttonStyle: "PILL",
};
const items: LandingCatalogItem[] = ["Clothing", " clothing ", "Food"].map((category, index) => ({
  key: String(index),
  sourceId: String(index),
  sourceType: "PRODUCT",
  name: `Product ${index}`,
  description: "",
  category,
  productType: "OTHER",
  mediaUrls: [],
  price: "100",
  variants: [],
  isFeatured: false,
  isAvailable: index !== 2,
}));

describe("landing catalog", () => {
  it("automatically shows all items in category rows, filters, restores All, and adds to cart", () => {
    const component = createLandingComponent("CATALOG");
    const onAddToCart = vi.fn();
    const { rerender } = render(
      <LandingPageComponentView
        component={component}
        theme={theme}
        menuItems={[]}
        catalogItems={items}
        onAddToCart={onAddToCart}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Clothing carousel" })).toHaveClass(
      "overflow-x-auto",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clothing" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const addButton = screen.getAllByRole("button", { name: "Add to cart" })[0];
    if (!addButton) throw new Error("Missing add button");
    fireEvent.click(addButton);
    expect(onAddToCart).toHaveBeenCalledWith(items[0]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
    rerender(
      <LandingPageComponentView
        component={component}
        theme={theme}
        menuItems={[]}
        catalogItems={items.slice(0, 1)}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
  it("uses readable CTA defaults and scopes overrides to one component", () => {
    const component = createLandingComponent("CTA");
    const { rerender } = render(
      <LandingPageComponentView component={component} theme={theme} menuItems={[]} />,
    );
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveStyle({ color: "#000000" });
    rerender(
      <>
        <LandingPageComponentView
          component={{ ...component, buttonTextColor: "#123456" }}
          theme={theme}
          menuItems={[]}
        />
        <LandingPageComponentView component={component} theme={theme} menuItems={[]} />
      </>,
    );
    const links = screen.getAllByRole("link", { name: "Contact us" });
    expect(links[0]).toHaveStyle({ color: "#123456" });
    expect(links[1]).toHaveStyle({ color: "#000000" });
    expect(contrastingButtonText("#000000")).toBe("#ffffff");
  });
});
