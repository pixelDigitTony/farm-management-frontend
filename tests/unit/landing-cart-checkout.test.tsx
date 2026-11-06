import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { safeParse } from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/api/client";
import { landingPageVariantUpdateSchema } from "@/lib/landing-page/schema";
import { LandingPreviewPage } from "@/pages/LandingPreviewPage";
import { PublicLandingPage } from "@/pages/PublicLandingPage";
import type { LandingCatalogItem } from "@/types/landing-page";
import {
  createLandingComponent,
  createLandingSection,
  defaultLandingPageCommerceSettings,
} from "@/types/landing-page";

vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  api: vi.fn(),
}));
vi.mock("@/hooks/useLandingAnalytics", () => ({
  useLandingAnalytics: () => ({
    track: vi.fn(),
    sessionId: () => "session",
    preference: "declined",
    choose: vi.fn(),
  }),
}));
const rendererMode = vi.hoisted(() => ({ real: false }));
vi.mock("@/components/landing-page/LandingPageRenderer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/landing-page/LandingPageRenderer")>();
  const Stub = (props: {
    onAddToCart: (
      item: LandingCatalogItem,
      variant?: undefined,
      quantity?: number,
      shop?: boolean,
    ) => { acceptedQuantity: number; rejectionReason: string | null };
    onOpenCart: () => void;
    onPublicDialogChange: (open: boolean) => void;
    catalogItems: LandingCatalogItem[];
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          const product = props.catalogItems[0];
          const output = document.getElementById("result");
          if (product && output)
            output.textContent = JSON.stringify(props.onAddToCart(product, undefined, 5));
        }}
      >
        Add five
      </button>
      <button type="button" onClick={props.onOpenCart}>
        Open cart
      </button>
      <button type="button" onClick={() => props.onPublicDialogChange(true)}>
        Open menu
      </button>
      <output id="result" />
    </div>
  );
  return {
    ...actual,
    LandingPageRenderer: (props: ComponentProps<typeof actual.LandingPageRenderer>) =>
      rendererMode.real ? (
        <actual.LandingPageRenderer {...props} />
      ) : (
        <Stub {...(props as Parameters<typeof Stub>[0])} />
      ),
  };
});
const item: LandingCatalogItem = {
  key: "PRODUCT:one",
  sourceType: "PRODUCT",
  sourceId: "one",
  name: "Apples",
  description: "",
  productType: "FARM_PRODUCT",
  mediaUrls: [],
  price: "10",
  variants: [],
  isAvailable: true,
  isFeatured: false,
};
const data = () => ({
  slug: "test",
  pageId: "page",
  businessId: "business",
  siteTitle: "Test",
  seoDescription: "",
  publishedAt: "",
  menuItems: [],
  catalogItems: [item],
  variant: {
    schemaVersion: 2,
    goal: "SHOP",
    theme: {
      primaryColor: "#315638",
      backgroundColor: "#FFFFFF",
      surfaceColor: "#FFFFFF",
      textColor: "#222222",
      fontStyle: "MODERN",
      buttonStyle: "PILL",
    },
    commerce: {
      ...defaultLandingPageCommerceSettings,
      orderingEnabled: true,
      fulfillmentMethods: ["PICKUP", "DELIVERY"],
    },
    sections: [],
  },
});
function setup(initial = data()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(["public-landing-page", "test"], initial);
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PublicLandingPage slug="test" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  rendererMode.real = false;
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
describe("public cart and checkout", () => {
  it("closes an already open storefront at its access deadline even if revalidation is offline", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError("Offline", 503));
    const timed = {
      ...data(),
      serverTime: new Date().toISOString(),
      publicAccessEndsAt: new Date(Date.now() + 250).toISOString(),
    };
    setup(timed);
    expect(screen.getByText("Add five")).toBeInTheDocument();
    await screen.findByText("This page is currently unavailable");
    expect(screen.queryByText("Add five")).not.toBeInTheDocument();
  });
  it("uses hydrated quantity for back-to-back additions, partial cap and whole-line removal", async () => {
    localStorage.setItem(
      "miss-v-cart:business:page",
      JSON.stringify([
        {
          key: "PRODUCT:one:",
          sourceType: "PRODUCT",
          sourceId: "one",
          variantId: null,
          name: "Apples",
          variantName: "",
          mediaUrl: "",
          unitPrice: 10,
          quantity: 97,
        },
      ]),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/97 items/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add five"));
    expect(
      screen.getByText('{"acceptedQuantity":2,"rejectionReason":"QUANTITY_LIMIT"}'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Add five"));
    expect(
      screen.getByText('{"acceptedQuantity":0,"rejectionReason":"QUANTITY_LIMIT"}'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open cart"));
    expect(screen.getByText(/99 items ·/)).not.toBeVisible();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Apples" }));
    fireEvent.click(screen.getByText("Add five"));
    expect(screen.getByText('{"acceptedQuantity":5,"rejectionReason":null}')).toBeInTheDocument();
  });
  it("retains checkout fields on failed refresh and reconciles live fulfillment", async () => {
    vi.mocked(api).mockResolvedValue(data());
    const { client } = setup();
    fireEvent.click(screen.getByText("Add five"));
    fireEvent.click(screen.getByText("Open cart"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    await screen.findByRole("heading", { name: "Checkout" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    fireEvent.change(screen.getByLabelText("Delivery address"), { target: { value: "Farm road" } });
    vi.mocked(api).mockRejectedValueOnce(new ApiError("Unavailable", 503));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["public-landing-page", "test"] });
    });
    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    const updated = data();
    updated.variant.commerce.fulfillmentMethods = ["PICKUP"];
    act(() => client.setQueryData(["public-landing-page", "test"], updated));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pickup" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByText(/previous delivery method is no longer available/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    const restored = data();
    act(() => client.setQueryData(["public-landing-page", "test"], restored));
    await screen.findByRole("button", { name: "Delivery" });
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.getByLabelText("Delivery address")).toHaveValue("Farm road");
    const none = data();
    none.variant.commerce.fulfillmentMethods = [];
    act(() => client.setQueryData(["public-landing-page", "test"], none));
    await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled());
    expect(await screen.findByText(/No fulfillment methods/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I reviewed the updated total" }));
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    act(() => client.setQueryData(["public-landing-page", "test"], restored));
    await screen.findByRole("button", { name: "Delivery" });
    expect(screen.queryByText(/No fulfillment methods/)).not.toBeInTheDocument();
  });
  it("rejects a stale product after catalog removal and hides the bar during public dialogs", async () => {
    const { client } = setup();
    fireEvent.click(screen.getByText("Add five"));
    expect(screen.getByText(/5 items ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open menu"));
    expect(screen.getByText(/5 items ·/)).not.toBeVisible();
    const removed = data();
    removed.catalogItems = [{ ...item, isAvailable: false }];
    act(() => client.setQueryData(["public-landing-page", "test"], removed));
    await waitFor(() =>
      expect(client.getQueryData(["public-landing-page", "test"])).toEqual(removed),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    fireEvent.click(screen.getByText("Add five"));
    expect(
      screen.getByText('{"acceptedQuantity":0,"rejectionReason":"UNAVAILABLE_SELECTION"}'),
    ).toBeInTheDocument();
  });
  it("rejects additions while an order is pending and resets admission after success", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(api)
      .mockResolvedValueOnce(data())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    setup();
    fireEvent.click(screen.getByText("Add five"));
    fireEvent.click(screen.getByText("Open cart"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    await screen.findByRole("heading", { name: "Checkout" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[1]?.[1]?.body));
    expect(payload).toMatchObject({
      fulfillmentMethod: "PICKUP",
      paymentMethod: "PAY_ON_PICKUP",
      items: [{ sourceId: "one", quantity: 5, expectedUnitPrice: 10 }],
      expectedTotal: 50,
    });
    expect(payload.idempotencyKey).toBeTruthy();
    fireEvent.click(screen.getByText("Add five"));
    expect(
      screen.getByText('{"acceptedQuantity":0,"rejectionReason":"PENDING_SUBMISSION"}'),
    ).toBeInTheDocument();
    await act(async () => finish({ orderNumber: "O-1", total: 50 }));
    await screen.findByText("Order received");
    fireEvent.click(screen.getByText("Add five"));
    expect(screen.getByText('{"acceptedQuantity":5,"rejectionReason":null}')).toBeInTheDocument();
  });
  it.each([
    [404, "This page is currently unavailable"],
    [503, "Unable to load this page"],
  ])("distinguishes initial %s errors", async (status, message) => {
    vi.mocked(api).mockRejectedValue(new ApiError("Failed", status as number));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PublicLandingPage slug="test" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(message as string)).toBeInTheDocument();
    if (status === 503) expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("updates and clears the measured reserve and disconnects its observer", async () => {
    const disconnect = vi.fn();
    let measure: () => void = () => {};
    class Observer {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", Observer);
    const geometry = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 72 } as DOMRect);
    const { container, unmount } = setup();
    fireEvent.click(screen.getByText("Add five"));
    const spacer = container.querySelector<HTMLElement>(".lp-public-cart-bar-spacer");
    await waitFor(() => expect(spacer).toHaveStyle({ height: "88px" }));
    geometry.mockReturnValue({ height: 96 } as DOMRect);
    act(() => measure());
    expect(spacer).toHaveStyle({ height: "112px" });
    fireEvent.click(screen.getByText("Open menu"));
    expect(container.querySelector(".lp-public-cart-bar-spacer")).toBeNull();
    expect(disconnect).toHaveBeenCalled();
    unmount();
    geometry.mockRestore();
    vi.unstubAllGlobals();
  });
  it("restores focus to the visible mobile cart opener after closing", async () => {
    setup();
    fireEvent.click(screen.getByText("Add five"));
    const opener = screen.getByRole("button", { name: "View cart" });
    opener.focus();
    fireEvent.click(opener);
    expect(opener).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener).toBeVisible();
  });
  it.each(["unchanged", "removed", "disabled", "hidden", "no controls"] as const)(
    "restores preview focus after a live update leaves the opener %s",
    async (change) => {
      rendererMode.real = true;
      const originalParent = window.parent;
      const parent = { postMessage: vi.fn() };
      Object.defineProperty(window, "parent", { configurable: true, value: parent });
      history.pushState({}, "", "/?nonce=secret");
      const header = createLandingComponent("HEADER");
      const catalog = createLandingComponent("CATALOG");
      catalog.appearance = { showShopNow: true };
      const payload = {
        mode: "PREVIEW" as const,
        catalogItems: [item],
        menuItems: [],
        draft: {
          _id: "same-draft",
          name: "Preview",
          revision: 1,
          schemaVersion: 2 as const,
          template: { id: "bold-market" as const, revision: 1 },
          goal: "SHOP" as const,
          theme: {
            primaryColor: "#315638",
            backgroundColor: "#ffffff",
            surfaceColor: "#ffffff",
            textColor: "#222222",
            fontStyle: "CLASSIC" as const,
            buttonStyle: "ROUNDED" as const,
            displayFont: "EDITORIAL_SERIF" as const,
            motionLevel: "OFF" as const,
          },
          commerce: { ...defaultLandingPageCommerceSettings, orderingEnabled: true },
          sections: [createLandingSection("Store", [header, catalog])],
        },
      };
      const send = (
        next: typeof payload,
        origin = location.origin,
        source = parent,
        nonce = "secret",
      ) =>
        act(() =>
          window.dispatchEvent(
            new MessageEvent("message", {
              origin,
              source: source as unknown as Window,
              data: { type: "LP_DOCUMENT", nonce, payload: next },
            }),
          ),
        );
      try {
        render(<LandingPreviewPage />);
        send(payload);
        const opener = await screen.findByRole("button", { name: "Add to cart" });
        opener.focus();
        fireEvent.click(opener);
        expect(within(screen.getByRole("dialog")).getByText("Apples × 1")).toBeInTheDocument();
        const updated = structuredClone(payload);
        if (change === "removed") updated.catalogItems = [];
        if (change === "disabled") updated.catalogItems = [{ ...item, isAvailable: false }];
        if (change === "no controls") {
          const section = updated.draft.sections[0];
          if (!section) throw new Error("Expected preview section");
          section.enabled = false;
        }
        send(updated, "https://invalid.example");
        send(updated, location.origin, { postMessage: vi.fn() });
        send(updated, location.origin, parent, "wrong");
        expect(opener.isConnected).toBe(true);
        expect(opener).toBeEnabled();
        send(updated);
        if (change === "hidden") opener.hidden = true;
        if (change === "removed" || change === "no controls")
          expect(opener.isConnected).toBe(false);
        if (change === "disabled") expect(opener).toBeDisabled();
        expect(within(screen.getByRole("dialog")).getByText("Apples × 1")).toBeInTheDocument();
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", { name: "Close dialog" }),
        );
        if (change === "no controls") {
          await waitFor(() =>
            expect(screen.getByRole("region", { name: "Storefront preview" })).toHaveFocus(),
          );
        } else if (change === "unchanged") {
          await waitFor(() => expect(opener).toHaveFocus());
        } else {
          await waitFor(() =>
            expect(screen.getByRole("button", { name: /Open cart/ })).toHaveFocus(),
          );
        }
        expect(api).not.toHaveBeenCalled();
        expect(localStorage.length).toBe(0);
      } finally {
        Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
        history.pushState({}, "", "/");
      }
    },
  );
  it("keeps preview cart local, rejects invalid parent messages and resets for a new draft", async () => {
    const originalParent = window.parent;
    const parent = { postMessage: vi.fn() };
    Object.defineProperty(window, "parent", { configurable: true, value: parent });
    history.pushState({}, "", "/?nonce=secret");
    const makePayload = (id: string) => {
      const hero = createLandingComponent("HERO");
      if (hero.type !== "HERO") throw new Error("Expected hero");
      hero.content.primaryLabel = "";
      hero.content.primaryUrl = "";
      return {
        mode: "PREVIEW",
        catalogItems: [item],
        menuItems: [],
        draft: {
          _id: id,
          name: "Preview",
          revision: 1,
          schemaVersion: 2,
          template: { id: "bold-market", revision: 1 },
          goal: "SHOP",
          theme: {
            primaryColor: "#315638",
            backgroundColor: "#ffffff",
            surfaceColor: "#ffffff",
            textColor: "#222222",
            fontStyle: "CLASSIC",
            buttonStyle: "ROUNDED",
            displayFont: "EDITORIAL_SERIF",
            motionLevel: "OFF",
          },
          commerce: { ...defaultLandingPageCommerceSettings, orderingEnabled: true },
          sections: [createLandingSection("Hero", [hero])],
        },
      };
    };
    const send = (payload: unknown, nonce = "secret") =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: location.origin,
            source: parent as unknown as Window,
            data: { type: "LP_DOCUMENT", nonce, payload },
          }),
        ),
      );
    try {
      render(<LandingPreviewPage />);
      send(makePayload("first"), "wrong");
      expect(screen.getByText(/Preparing your preview/)).toBeInTheDocument();
      expect(safeParse(landingPageVariantUpdateSchema, makePayload("first").draft).issues).toEqual(
        undefined,
      );
      send(makePayload("first"));
      await screen.findByText("Add five");
      fireEvent.click(screen.getByText("Add five"));
      fireEvent.click(screen.getByText("Open cart"));
      expect(screen.getByText(/Orders cannot be submitted/)).toBeInTheDocument();
      expect(screen.getByText(/Apples × 5/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remove Apples" }));
      fireEvent.click(screen.getByText("Add five"));
      expect(screen.getByText('{"acceptedQuantity":5,"rejectionReason":null}')).toBeInTheDocument();
      send(makePayload("second"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      fireEvent.click(screen.getByText("Open cart"));
      expect(screen.getByText("Your preview cart is empty.")).toBeInTheDocument();
      expect(api).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
      history.pushState({}, "", "/");
    }
  });
});
