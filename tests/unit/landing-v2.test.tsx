import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { safeParse } from "valibot";
import { describe, expect, it, vi } from "vitest";
import {
  StorefrontBlock,
  type StorefrontContext,
} from "@/components/landing-page/blocks/StorefrontBlocks";
import { BackgroundInspector, BlockInspector } from "@/components/landing-page/editor/Inspector";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { landingPageComponentSchema } from "@/lib/landing-page/schema";
import {
  createLandingComponent,
  createLandingSection,
  defaultLandingPageCommerceSettings,
  type LandingCatalogItem,
  type LandingPageVariant,
} from "@/types/landing-page";

vi.mock("@/components/landing-page/motion/LandingMotion", () => ({
  useLandingMotion: () => ({ mode: "PUBLIC", off: true, small: true }),
  DepthPlane: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ImageUpload", () => ({ ImageUpload: () => null }));
const theme = {
  primaryColor: "#315638",
  backgroundColor: "#F6F3E7",
  surfaceColor: "#FFFFFF",
  textColor: "#252525",
  fontStyle: "MODERN" as const,
  buttonStyle: "PILL" as const,
};
const product: LandingCatalogItem = {
  key: "PRODUCT:one",
  sourceId: "one",
  sourceType: "PRODUCT",
  name: "Real product",
  description: "Merchant-owned data",
  category: "Collection",
  productType: "OTHER",
  mediaUrls: [],
  price: "100",
  variants: [
    {
      variantId: "available",
      name: "Available size",
      attributes: [],
      price: "100",
      isAvailable: true,
    },
    {
      variantId: "unavailable",
      name: "Unavailable size",
      attributes: [],
      price: "120",
      isAvailable: false,
    },
  ],
  isFeatured: false,
  isAvailable: true,
};
const contact = createLandingSection("Contact", [createLandingComponent("CONTACT")]);
const context: StorefrontContext = {
  theme,
  goal: "SHOP",
  sections: [contact],
  catalogItems: [product],
};
describe("V2 storefront actions and editing", () => {
  it("preserves legacy rendering unless a document explicitly opts into V2", () => {
    const hero = createLandingComponent("HERO");
    if (hero.type !== "HERO") throw new Error("Expected the legacy hero fixture");
    hero.content.title = "Existing published design";
    for (const schemaVersion of [undefined, 1] as const) {
      const view = render(
        <LandingPageRenderer
          schemaVersion={schemaVersion}
          theme={{ ...theme, displayFont: "EDITORIAL_SERIF" }}
          sections={[createLandingSection("Legacy", [hero])]}
          menuItems={[]}
        />,
      );
      expect(view.getByRole("heading", { name: "Existing published design" })).toBeVisible();
      expect(view.container.querySelector(".lp-storefront")).toBeNull();
      expect(view.container.querySelector(".lp-background")).toBeNull();
      view.unmount();
    }
  });
  it("opens Quick View without mutating a cart, requires an available variant and bounded quantity, then adds the selected line", () => {
    const onAdd = vi.fn();
    const block = createLandingComponent("CATALOG");
    render(<StorefrontBlock block={block} context={{ ...context, onAdd }} />);
    fireEvent.click(screen.getByRole("button", { name: "Quick view" }));
    expect(onAdd).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Add to cart" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /Unavailable size/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Available size/ }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Quantity" }), {
      target: { value: 100 },
    });
    expect(within(dialog).getByRole("button", { name: "Add to cart" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Quantity" }), {
      target: { value: 2 },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
    expect(onAdd).toHaveBeenCalledWith(product, product.variants[0], 2, false);
  });
  it("renders inquiry details and a real contact destination, with no purchase actions or invented ratings", () => {
    render(
      <StorefrontBlock
        block={createLandingComponent("CATALOG")}
        context={{ ...context, goal: "INQUIRY" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add to cart" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
      "href",
      `#${contact.id}`,
    );
    expect(screen.queryByText(/sold|out of 5/i)).not.toBeInTheDocument();
  });
  it("preserves independent image and 3D preferences when switching background modes", () => {
    const initial = {
      mode: "THREE_D" as const,
      color: "#FFFFFF",
      threeD: {
        sceneId: "market-background" as const,
        sceneRevision: 1 as const,
        cameraPreset: "DESKTOP" as const,
        motion: "SUBTLE" as const,
        overlayOpacity: 0.2,
      },
      image: {
        url: "https://example.test/merchant.webp",
        alt: "Backdrop",
        focalPoint: { x: 0.2, y: 0.8 },
        aspectRatio: "WIDE" as const,
      },
    };
    let saved = initial;
    function Editor() {
      const [value, setValue] = useState(initial);
      return (
        <BackgroundInspector
          value={value}
          color="#FFFFFF"
          onChange={(next) => {
            if (next) {
              saved = next as typeof initial;
              setValue(next as typeof initial);
            }
          }}
        />
      );
    }
    render(<Editor />);
    for (const name of ["Image", "Color", "3D"])
      fireEvent.click(screen.getByRole("button", { name }));
    expect(saved.threeD).toEqual(initial.threeD);
    expect(saved.image).toEqual(initial.image);
    expect(saved.mode).toBe("THREE_D");
  });
  it("allows optional showcase media and actions to survive the authoritative block validator", () => {
    let saved = createLandingComponent("SHOWCASE");
    const draft = {
      _id: "draft",
      name: "Draft",
      schemaVersion: 2,
      template: { id: "farm-and-market", revision: 2 },
      goal: "SHOP",
      theme,
      commerce: defaultLandingPageCommerceSettings,
      sections: [contact],
    } as LandingPageVariant;
    function Editor() {
      const [block, setBlock] = useState(saved);
      return (
        <BlockInspector
          block={block}
          draft={draft}
          catalog={[product]}
          onChange={(next) => {
            saved = next;
            setBlock(next);
          }}
        />
      );
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add items" }));
    fireEvent.change(screen.getAllByLabelText("Use a sample asset")[0]!, {
      target: { value: "/landing-assets/web/bold-market/market-hero-1536.webp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Add actions" }));
    expect(saved.type).toBe("SHOWCASE");
    if (saved.type !== "SHOWCASE") throw new Error("Fixture");
    expect(saved.content.items[0]?.media?.url).toContain("market-hero");
    expect(saved.content.items[0]?.actions[0]?.target).toEqual({
      kind: "SECTION",
      sectionId: contact.id,
    });
    expect(safeParse(landingPageComponentSchema, saved).success).toBe(true);
  });
  it("exposes valid duration and mobile motion controls without arbitrary effect strings", () => {
    let saved = createLandingComponent("MEDIA_STORY");
    const draft = {
      _id: "draft",
      name: "Draft",
      schemaVersion: 2,
      template: { id: "bold-market", revision: 2 },
      goal: "SHOP",
      theme,
      commerce: defaultLandingPageCommerceSettings,
      sections: [contact],
    } as LandingPageVariant;
    function Editor() {
      const [block, setBlock] = useState(saved);
      return (
        <BlockInspector
          block={block}
          draft={draft}
          catalog={[]}
          onChange={(next) => {
            saved = next;
            setBlock(next);
          }}
        />
      );
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole("tab", { name: "Motion" }));
    fireEvent.change(screen.getByLabelText("Motion preset"), { target: { value: "REVEAL" } });
    const duration = screen.getByLabelText(/Duration ms/i);
    expect(duration).toHaveAttribute("min", "150");
    expect(duration).toHaveAttribute("max", "900");
    fireEvent.change(duration, { target: { value: 650 } });
    expect(saved.motion?.durationMs).toBe(650);
    expect(safeParse(landingPageComponentSchema, saved).success).toBe(true);
  });
});
