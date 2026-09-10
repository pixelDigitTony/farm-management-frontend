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
  it("shows all visible menu-page items only, groups categories, and preserves menu cart identity", () => {
    const component = createLandingComponent("MENU");
    const menus = Array.from({ length: 15 }, (_, i) => ({
      _id: `menu-${i}`,
      name: `Dish ${i}`,
      category: i < 8 ? "Meals" : "Drinks",
      sellingPricePerServing: "50",
      isAvailable: i !== 14,
    }));
    const onAddToCart = vi.fn();
    render(
      <LandingPageComponentView
        component={component}
        theme={theme}
        menuItems={[...menus, { _id: "hidden", name: "Hidden dish", showOnLandingPage: false }]}
        catalogItems={items}
        onAddToCart={onAddToCart}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(15);
    expect(screen.queryByText("Hidden dish")).not.toBeInTheDocument();
    expect(screen.queryByText("Product 0")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Meals carousel" })).toHaveClass("overflow-x-auto");
    fireEvent.click(screen.getByRole("button", { name: "Drinks" }));
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
    const button = screen.getAllByRole("button", { name: "Add to cart" })[0];
    if (!button) throw new Error("Missing menu cart button");
    fireEvent.click(button);
    expect(onAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "MENU_ITEM", sourceId: "menu-8", price: "50" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("article")).toHaveLength(15);
  });
  it.each(["MENU", "CATALOG"] as const)(
    "searches %s items with category filters and restores results when cleared",
    (type) => {
      render(
        <LandingPageComponentView
          component={createLandingComponent(type)}
          theme={theme}
          menuItems={items.map((item) => ({
            _id: item.sourceId,
            name: item.name,
            category: item.category,
          }))}
          catalogItems={items}
        />,
      );
      const search = screen.getByRole("searchbox", {
        name: type === "MENU" ? "Search menu items" : "Search products",
      });
      fireEvent.change(search, { target: { value: "  PRODUCT 1  " } });
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(screen.getByRole("heading", { name: "Product 1" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Food" }));
      expect(screen.queryAllByRole("article")).toHaveLength(0);
      expect(screen.getByRole("status")).toHaveTextContent("No matching items in this category");
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      expect(screen.getAllByRole("article")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "All" }));
      expect(screen.getAllByRole("article")).toHaveLength(3);
      fireEvent.change(search, { target: { value: "CLOTHING" } });
      expect(screen.getAllByRole("article")).toHaveLength(2);
    },
  );
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
