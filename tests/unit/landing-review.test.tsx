import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { safeParse } from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StorefrontBlock,
  type StorefrontContext,
} from "@/components/landing-page/blocks/StorefrontBlocks";
import { BlockInspector } from "@/components/landing-page/editor/Inspector";
import { ResponsiveImage } from "@/components/landing-page/ResponsiveImage";
import { landingPageVariantUpdateSchema } from "@/lib/landing-page/schema";
import { reconcileSectionLinks } from "@/lib/landing-page/section-links";
import {
  createLandingComponent,
  createLandingSection,
  defaultLandingPageCommerceSettings,
  type LandingPageVariant,
} from "@/types/landing-page";

vi.mock("@/components/landing-page/motion/LandingMotion", () => ({
  useLandingMotion: () => ({ mode: "PUBLIC", off: true, small: true }),
  DepthPlane: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ImageUpload", () => ({ ImageUpload: () => null }));
let mobile = false;
let listeners: Set<() => void>;
beforeEach(() => {
  mobile = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    matches: mobile,
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());
function draft() {
  const header = createLandingComponent("HEADER");
  const hero = createLandingComponent("HERO");
  if (header.type !== "HEADER" || hero.type !== "HERO") throw new Error("Fixture");
  const target = {
    ...createLandingSection("Details", [createLandingComponent("TEXT")]),
    anchor: "details",
  };
  header.content.navigation = [
    { label: "Details", target: { kind: "SECTION", sectionId: target.id } },
  ];
  header.content.action = { label: "Explore", target: { kind: "LINK", url: "#details" } };
  hero.content.primaryUrl = "#details";
  hero.content.secondaryUrl = "https://example.test/collection";
  return {
    _id: "draft",
    name: "Draft",
    schemaVersion: 2,
    template: { id: "bold-market", revision: 2 },
    goal: "CATALOG",
    theme: {
      primaryColor: "#315638",
      backgroundColor: "#FFFFFF",
      surfaceColor: "#FFFFFF",
      textColor: "#252525",
      fontStyle: "MODERN",
      buttonStyle: "PILL",
      displayFont: "MODERN_GROTESK",
      motionLevel: "OFF",
    },
    commerce: { ...defaultLandingPageCommerceSettings, orderingEnabled: false },
    sections: [
      createLandingSection("Header", [header]),
      createLandingSection("Hero", [hero]),
      target,
    ],
  } as LandingPageVariant;
}
describe("Landing specification review regressions", () => {
  it.each(["hide", "delete"])(
    "keeps the document valid after a linked section %s and leaves the previous history entry intact",
    (action) => {
      const before = draft();
      const next = structuredClone(before);
      if (action === "hide") next.sections[2]!.enabled = false;
      else next.sections.pop();
      const repaired = reconcileSectionLinks(before, next);
      expect(safeParse(landingPageVariantUpdateSchema, repaired).success).toBe(true);
      expect(repaired.sections[0]!.components[0]!.content).toMatchObject({ navigation: [] });
      expect(repaired.sections[0]!.components[0]!.content).not.toHaveProperty("action");
      expect(repaired.sections[1]!.components[0]!.content).toMatchObject({
        primaryUrl: "",
        secondaryUrl: "https://example.test/collection",
      });
      expect(before.sections[1]!.components[0]!.content).toHaveProperty("primaryUrl", "#details");
    },
  );
  it("retargets renamed anchors and their structured links", () => {
    const before = draft();
    const next = structuredClone(before);
    next.sections[2]!.anchor = "new-details";
    const repaired = reconcileSectionLinks(before, next);
    expect(safeParse(landingPageVariantUpdateSchema, repaired).success).toBe(true);
    expect(repaired.sections[1]!.components[0]!.content).toHaveProperty(
      "primaryUrl",
      "#new-details",
    );
    expect(repaired.sections[0]!.components[0]!.content).toHaveProperty(
      "action.target.url",
      "#new-details",
    );
  });
  it.each(["HERO", "CATALOG", "CONTACT", "CTA", "TEXT", "MEDIA_STORY"] as const)(
    "matches the server body limit in the %s inspector",
    (type) => {
      const block = createLandingComponent(type);
      const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
      });
      client.setQueryData(["landing-categories"], { items: [] });
      render(
        <QueryClientProvider client={client}>
          <BlockInspector block={block} draft={draft()} catalog={[]} onChange={() => {}} />
        </QueryClientProvider>,
      );
      expect(screen.getByLabelText("Body")).toHaveAttribute(
        "maxlength",
        ["TEXT", "MEDIA_STORY"].includes(type) ? "2000" : "500",
      );
    },
  );
  it("stacks every story frame and caption with motion disabled", () => {
    const block = createLandingComponent("MEDIA_STORY");
    if (block.type !== "MEDIA_STORY") throw new Error("Fixture");
    block.motion = {
      preset: "STICKY_STORY",
      intensity: "SUBTLE",
      durationMs: 450,
      mobile: "STATIC",
    };
    block.content.frames = [1, 2, 3].map((id) => ({
      id: String(id),
      caption: `Scene ${id}`,
      media: {
        url: `https://example.test/${id}.webp`,
        alt: `Frame ${id}`,
        focalPoint: { x: 0.5, y: 0.5 },
        aspectRatio: "WIDE",
      },
    }));
    const doc = draft();
    const context: StorefrontContext = {
      theme: doc.theme,
      goal: "CATALOG",
      sections: doc.sections,
      catalogItems: [],
    };
    const view = render(<StorefrontBlock block={block} context={context} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    for (const id of [1, 2, 3]) expect(screen.getByText(`Scene ${id}`)).toBeVisible();
    expect(view.container.querySelector(".lp-story-sticky")).toBeNull();
    expect(screen.queryByRole("group", { name: "Story images" })).toBeNull();
  });
  it("does not show a search button when every catalog is hidden or absent", () => {
    const doc = draft();
    const header = doc.sections[0]!.components[0]!;
    const context: StorefrontContext = {
      theme: doc.theme,
      goal: "CATALOG",
      sections: doc.sections,
      catalogItems: [],
    };
    const view = render(<StorefrontBlock block={header} context={context} />);
    expect(screen.queryByRole("button", { name: "Search collection" })).toBeNull();
    context.sections.push(createLandingSection("Collection", [createLandingComponent("CATALOG")]));
    view.rerender(<StorefrontBlock block={header} context={context} />);
    expect(screen.getByRole("button", { name: "Search collection" })).toBeVisible();
  });
  it("lets an explicit grid override the legacy horizontal catalog display", () => {
    const doc = draft();
    const block = createLandingComponent("CATALOG");
    if (block.type !== "CATALOG") throw new Error("Fixture");
    block.content.displayMode = "HORIZONTAL";
    block.appearance = { layout: "GRID" };
    const view = render(
      <StorefrontBlock
        block={block}
        context={{
          theme: doc.theme,
          goal: "CATALOG",
          sections: doc.sections,
          catalogItems: [
            {
              key: "PRODUCT:item",
              sourceId: "item",
              sourceType: "PRODUCT",
              name: "Merchant product",
              description: "",
              productType: "OTHER",
              mediaUrls: [],
              price: "0",
              variants: [],
              isFeatured: false,
              isAvailable: true,
            },
          ],
        }}
      />,
    );
    expect(view.container.querySelector(".lp-rail")).toBeNull();
    expect(view.container.querySelector(".lp-products")).not.toBeNull();
  });
  it("loads stored mobile media through the public/auth loader and recovers from failed images", async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => new Blob(["image"]) });
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL() {
          return "blob:mobile-test";
        }
        static revokeObjectURL() {}
      },
    );
    render(
      <ResponsiveImage
        src="https://example.test/desktop.webp"
        mobileSrc="/api/images/507f1f77bcf86cd799439011"
        alt="Responsive scene"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />,
    );
    act(() => {
      mobile = true;
      for (const listener of listeners) listener();
    });
    await waitFor(() =>
      expect(screen.getByAltText("Responsive scene")).toHaveAttribute("src", "blob:mobile-test"),
    );
    expect(String(fetchImage.mock.calls[0]![0])).toContain(
      "/public/images/507f1f77bcf86cd799439011",
    );
    const image = screen.getByAltText("Responsive scene");
    fireEvent.error(image);
    expect(image).not.toBeVisible();
    fireEvent.load(image);
    expect(image).toBeVisible();
  });
});
