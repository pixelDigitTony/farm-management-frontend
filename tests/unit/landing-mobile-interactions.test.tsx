import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  StorefrontBlock,
  type StorefrontContext,
} from "@/components/landing-page/blocks/StorefrontBlocks";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import type { LandingBackgroundState } from "@/lib/landing-page/theme";
import {
  createLandingComponent,
  createLandingSection,
  type LandingCatalogItem,
} from "@/types/landing-page";

const backgrounds = vi.hoisted(() => ({
  callbacks: [] as Array<(state: LandingBackgroundState) => void>,
}));
vi.mock("@/components/landing-page/Background", () => ({
  LandingBackground: ({
    onVisualStateChange,
  }: {
    onVisualStateChange?: (state: LandingBackgroundState) => void;
  }) => {
    if (onVisualStateChange) backgrounds.callbacks.push(onVisualStateChange);
    return null;
  },
}));
vi.mock("@/components/landing-page/motion/LandingMotion", () => ({
  useLandingMotion: () => ({ mode: "PUBLIC", off: true, small: true }),
  DepthPlane: ({ children }: { children: React.ReactNode }) => children,
  MotionBlock: ({ children }: { children: React.ReactNode }) => children,
  LandingMotionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const theme = {
  primaryColor: "#315638",
  backgroundColor: "#F6F3E7",
  surfaceColor: "#FFFFFF",
  textColor: "#252525",
  fontStyle: "MODERN" as const,
  buttonStyle: "PILL" as const,
};
const item: LandingCatalogItem = {
  key: "PRODUCT:one",
  sourceId: "one",
  sourceType: "PRODUCT",
  name: "Basket",
  description: "Handmade",
  category: "Textiles",
  productType: "OTHER",
  mediaUrls: [],
  price: 80,
  isFeatured: false,
  isAvailable: true,
  variants: [
    {
      variantId: "one",
      name: "Standard",
      attributes: [{ name: "Color", value: "Indigo" }],
      price: 100,
      isAvailable: true,
    },
    { variantId: "two", name: "Discounted", attributes: [], price: 1, isAvailable: false },
  ],
};
const other: LandingCatalogItem = {
  ...item,
  key: "PRODUCT:two",
  sourceId: "two",
  name: "Jar",
  category: "Pantry",
  variants: [],
  price: 50,
};
const catalog = createLandingComponent("CATALOG");
const contact = createLandingSection("Contact", [createLandingComponent("CONTACT")]);
const base: StorefrontContext = {
  theme,
  goal: "SHOP",
  sections: [contact],
  catalogItems: [item, other],
};

describe("mobile storefront interactions", () => {
  it.each(["STANDARD", "COMPACT", "BOUTIQUE"] as const)(
    "shows one clear product action in %s cards, even with all legacy buttons enabled",
    (cardLayout) => {
      render(
        <StorefrontBlock
          block={{
            ...catalog,
            appearance: { cardLayout, showShopNow: true, showAddToCart: true, showQuickView: true },
          }}
          context={{ ...base, onAdd: vi.fn() }}
        />,
      );
      for (const [name, action] of [
        ["Basket", "Choose options"],
        ["Jar", "Add to cart"],
      ]) {
        const card = screen.getByRole("heading", { name }).closest("article");
        if (!card) throw new Error("Expected product card");
        expect(within(card).getAllByRole("button")).toHaveLength(1);
        expect(within(card).getByRole("button", { name: action })).toBeEnabled();
      }
      expect(screen.queryByRole("button", { name: "Shop now" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Quick view" })).not.toBeInTheDocument();
    },
  );
  it.each(["CATALOG", "INQUIRY"] as const)(
    "keeps one read-only details action for %s pages",
    (goal) => {
      render(
        <StorefrontBlock
          block={{
            ...catalog,
            appearance: { showShopNow: true, showAddToCart: true, showQuickView: true },
          }}
          context={{ ...base, goal, onAdd: vi.fn() }}
        />,
      );
      for (const card of screen.getAllByRole("article")) {
        expect(within(card).getAllByRole("button")).toHaveLength(1);
        expect(within(card).getByRole("button", { name: "View details" })).toBeEnabled();
      }
    },
  );
  it("searches variant attributes, clears both filters, reconciles removed categories, and prices only available variants", () => {
    const view = render(<StorefrontBlock block={catalog} context={base} />);
    const basket = screen.getByRole("heading", { name: "Basket" }).closest("article");
    if (!basket) throw new Error("Expected product card");
    expect(basket).toHaveTextContent("100.00");
    expect(basket).not.toHaveTextContent("1.00");
    fireEvent.click(screen.getByRole("button", { name: "Textiles" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Indigo" } });
    expect(screen.getByRole("heading", { name: "Basket" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Jar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Textiles" }));
    view.rerender(<StorefrontBlock block={catalog} context={{ ...base, catalogItems: [other] }} />);
    expect(screen.getByRole("heading", { name: "Jar" })).toBeVisible();
    view.rerender(<StorefrontBlock block={catalog} context={base} />);
    expect(screen.getByRole("heading", { name: "Jar" })).toBeVisible();
    view.rerender(
      <StorefrontBlock
        block={catalog}
        context={{
          ...base,
          catalogItems: [
            { ...item, variants: item.variants.map((v) => ({ ...v, isAvailable: false })) },
          ],
          onAdd: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Currently unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose options" })).toBeDisabled();
  });

  it("restores the real opener and themes the dialog; handles live removal and selection changes", async () => {
    const view = render(
      <StorefrontBlock
        block={catalog}
        context={{ ...base, catalogItems: [item], onAdd: vi.fn() }}
      />,
    );
    const opener = screen.getByRole("button", { name: "Choose options" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("lp-storefront-portal");
    expect(dialog.style.getPropertyValue("--lp-primary")).toBe(theme.primaryColor);
    fireEvent.click(within(dialog).getByRole("button", { name: /Standard/ }));
    view.rerender(
      <StorefrontBlock
        block={catalog}
        context={{
          ...base,
          catalogItems: [{ ...item, variants: item.variants.slice(1) }],
          onAdd: vi.fn(),
        }}
      />,
    );
    expect(within(dialog).getByRole("button", { name: "Add to cart" })).toBeDisabled();
    view.rerender(
      <StorefrontBlock block={catalog} context={{ ...base, catalogItems: [], onAdd: vi.fn() }} />,
    );
    expect(within(dialog).getByText("This product is no longer available.")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("announces partial and rejected additions accurately and keeps rejected details open", async () => {
    const onAdd = vi
      .fn()
      .mockReturnValueOnce({ acceptedQuantity: 0, rejectionReason: "QUANTITY_LIMIT" })
      .mockReturnValueOnce({ acceptedQuantity: 2, rejectionReason: "QUANTITY_LIMIT" });
    render(<StorefrontBlock block={catalog} context={{ ...base, catalogItems: [item], onAdd }} />);
    const opener = screen.getByRole("button", { name: "Choose options" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Standard/ }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Quantity" }), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("quantity limit");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 items of Basket added to cart; quantity limit reached",
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes inquiry details before focusing contact and disables pending purchases", async () => {
    const section = document.createElement("section");
    section.id = contact.id;
    document.body.append(section);
    const view = render(
      <StorefrontBlock
        block={catalog}
        context={{ ...base, catalogItems: [item], goal: "INQUIRY" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Contact us" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(section).toHaveFocus();
    section.remove();
    view.rerender(
      <StorefrontBlock
        block={catalog}
        context={{ ...base, catalogItems: [item], onAdd: vi.fn() }}
      />,
    );
    const purchaseOpener = screen.getByRole("button", { name: "Choose options" });
    fireEvent.click(purchaseOpener);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Standard/ }));
    view.rerender(
      <StorefrontBlock
        block={catalog}
        context={{ ...base, catalogItems: [item], cartPending: true, onAdd: vi.fn() }}
      />,
    );
    expect(purchaseOpener).toBeDisabled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add to cart" }),
    ).toBeDisabled();
  });

  it("reports dialog visibility and cleans up on unmount", async () => {
    const onPublicDialogChange = vi.fn();
    const view = render(
      <LandingPageRenderer
        schemaVersion={2}
        theme={theme}
        sections={[createLandingSection("Products", [catalog])]}
        menuItems={[]}
        catalogItems={[item]}
        onPublicDialogChange={onPublicDialogChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(onPublicDialogChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onPublicDialogChange).toHaveBeenLastCalledWith(false);
    await act(async () => {});
    expect(onPublicDialogChange.mock.calls).toEqual([[true], [false]]);
  });

  it("transfers an accepted product selection to a cart without refocusing the inert opener", async () => {
    const shopCatalog = { ...catalog, appearance: { ...catalog.appearance, showShopNow: true } };
    const captured: Array<Element | null> = [];
    function Host() {
      const [cartOpen, setCartOpen] = useState(false);
      const cartButton = useRef<HTMLButtonElement>(null);
      useEffect(() => {
        if (cartOpen) cartButton.current?.focus();
      }, [cartOpen]);
      return (
        <>
          <StorefrontBlock
            block={shopCatalog}
            context={{
              ...base,
              catalogItems: [item],
              onAdd: () => {
                captured.push(document.querySelector("[data-lp-detail-opener]"));
                setCartOpen(true);
                return { acceptedQuantity: 1, rejectionReason: null };
              },
            }}
          />
          {cartOpen && (
            <div role="dialog" aria-label="Cart">
              <button
                type="button"
                ref={cartButton}
                onClick={() => {
                  setCartOpen(false);
                  (captured[0] as HTMLElement | null)?.focus();
                }}
              >
                Close cart
              </button>
            </div>
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Choose options" });
    opener.focus();
    fireEvent.click(opener);
    const details = screen.getByRole("dialog", { name: "Basket" });
    fireEvent.click(within(details).getByRole("button", { name: /Standard/ }));
    fireEvent.click(within(details).getByRole("button", { name: "Add and review cart" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Basket" })).not.toBeInTheDocument(),
    );
    const cartClose = screen.getByRole("button", { name: "Close cart" });
    expect(captured[0]).toBe(opener);
    await waitFor(() => expect(cartClose).toHaveFocus());
    fireEvent.click(cartClose);
    expect(opener).toHaveFocus();
  });

  it("restores navigation and detail openers on Escape and reports each visibility change", async () => {
    const header = createLandingComponent("HEADER");
    if (header.type !== "HEADER") throw new Error("Expected header");
    header.content.navigation = [
      { label: "Contact", target: { kind: "SECTION", sectionId: contact.id } },
    ];
    const onPublicDialogChange = vi.fn();
    render(
      <LandingPageRenderer
        schemaVersion={2}
        theme={theme}
        sections={[
          createLandingSection("Header", [header]),
          createLandingSection("Products", [catalog]),
        ]}
        menuItems={[]}
        catalogItems={[item]}
        onPublicDialogChange={onPublicDialogChange}
      />,
    );
    const menu = screen.getByRole("button", { name: "Open navigation" });
    menu.focus();
    fireEvent.click(menu);
    expect(screen.getByRole("dialog")).toHaveClass("lp-storefront-portal");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(menu).toHaveFocus());
    await act(async () => {});
    const detailOpener = screen.getByRole("button", { name: "View details" });
    detailOpener.focus();
    fireEvent.click(detailOpener);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(detailOpener).toHaveFocus());
    await act(async () => {});
    expect(onPublicDialogChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it("does not report a closed gap when one owned dialog replaces another", async () => {
    const header = createLandingComponent("HEADER");
    if (header.type !== "HEADER") throw new Error("Expected header");
    header.content.navigation = [
      { label: "Contact", target: { kind: "SECTION", sectionId: contact.id } },
    ];
    const onPublicDialogChange = vi.fn();
    render(
      <LandingPageRenderer
        schemaVersion={2}
        theme={theme}
        sections={[
          createLandingSection("Header", [header]),
          createLandingSection("Products", [catalog]),
        ]}
        menuItems={[]}
        catalogItems={[item]}
        onPublicDialogChange={onPublicDialogChange}
      />,
    );
    const detailOpener = screen.getByRole("button", { name: "View details" });
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const menu = screen.getByRole("dialog");
    act(() => {
      fireEvent.click(within(menu).getByRole("button", { name: "Close dialog" }));
      fireEvent.click(detailOpener);
    });
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Basket" })).toBeInTheDocument();
    expect(onPublicDialogChange.mock.calls).toEqual([[true]]);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close dialog" }),
    );
    await act(async () => {});
    expect(onPublicDialogChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps section and external navigation targets and names bounded keyboard regions", async () => {
    const header = createLandingComponent("HEADER");
    if (header.type !== "HEADER") throw new Error("Expected header");
    header.content.navigation = [
      { label: "Contact", target: { kind: "SECTION", sectionId: contact.id } },
      { label: "External", target: { kind: "LINK", url: "https://example.test/shop" } },
    ];
    const bounded = { ...contact, maxHeight: 400 };
    render(
      <LandingPageRenderer
        schemaVersion={2}
        theme={theme}
        sections={[createLandingSection("Header", [header]), bounded]}
        menuItems={[]}
      />,
    );
    const section = screen.getByRole("region", { name: "Contact" });
    expect(section).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const menu = screen.getByRole("dialog");
    expect(within(menu).getByRole("link", { name: "External" })).toHaveAttribute(
      "href",
      "https://example.test/shop",
    );
    expect(within(menu).getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      `#${contact.id}`,
    );
    fireEvent.click(within(menu).getByRole("link", { name: "Contact" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(section).toHaveFocus();
  });

  it("ignores stale hero callbacks even when switching back to an earlier source", () => {
    backgrounds.callbacks.length = 0;
    const hero = createLandingComponent("HERO");
    const image = {
      mode: "IMAGE" as const,
      color: "#ffffff",
      image: {
        url: "https://example.test/a.jpg",
        alt: "a",
        focalPoint: { x: 0.5, y: 0.5 },
        aspectRatio: "WIDE" as const,
      },
    };
    const renderHero = (background: typeof image) => (
      <StorefrontBlock block={hero} context={{ ...base, background }} />
    );
    const view = render(renderHero(image));
    const first = backgrounds.callbacks.at(-1);
    if (!first) throw new Error("Expected background callback");
    view.rerender(
      renderHero({ ...image, image: { ...image.image, url: "https://example.test/b.jpg" } }),
    );
    view.rerender(renderHero(image));
    const current = backgrounds.callbacks.at(-1);
    if (!current) throw new Error("Expected current background callback");
    act(() => first("ready"));
    expect(view.container.querySelector("[data-background-state]")).toHaveAttribute(
      "data-background-state",
      "loading",
    );
    act(() => current("fallback"));
    expect(view.container.querySelector("[data-background-state]")).toHaveClass("lp-hero-flat");
  });
});
