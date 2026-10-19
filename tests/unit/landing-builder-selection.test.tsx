import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/api/client";
import type { PreviewPayload } from "@/components/landing-page/editor/PreviewFrame";
import { LandingPageBuilderPage } from "@/pages/LandingPageBuilderPage";
import {
  createLandingComponent,
  createLandingSection,
  defaultLandingPageCommerceSettings,
  type LandingPageBuilderData,
  type LandingPageVariant,
} from "@/types/landing-page";

vi.mock("@/components/landing-page/editor/PreviewFrame", () => ({
  PreviewFrame: ({ payload }: { payload: PreviewPayload }) => (
    <output aria-label="Previewed variant">{payload.draft.name}</output>
  ),
}));

function document(id: string, name: string): LandingPageVariant {
  const hero = createLandingComponent("HERO");
  if (hero.type === "HERO") {
    hero.content.primaryLabel = "";
    hero.content.primaryUrl = "";
  }
  return {
    _id: id,
    name,
    revision: 1,
    schemaVersion: 2,
    template: { id: id === "main-variant" ? "bold-market" : "editorial-studio", revision: 1 },
    goal: "SHOP",
    theme: {
      primaryColor: "#be185d",
      backgroundColor: "#ffffff",
      surfaceColor: "#ffffff",
      textColor: "#222222",
      fontStyle: "CLASSIC",
      buttonStyle: "ROUNDED",
      displayFont: "EDITORIAL_SERIF",
      motionLevel: "OFF",
    },
    commerce: defaultLandingPageCommerceSettings,
    sections: [createLandingSection(name, [hero])],
  };
}

function setup(overrides: { isPublished?: boolean; publishedVariantId?: string } = {}) {
  const data: LandingPageBuilderData = {
    page: {
      _id: "page-one",
      slug: "farm-shop",
      name: "Farm shop",
      siteTitle: "Farm shop",
      seoDescription: "Our farm shop",
      isPublished: true,
      publishedVariantId: "live-variant",
      ...overrides,
    },
    variants: [document("main-variant", "Main"), document("live-variant", "Live shop")],
    menuItems: [],
    catalogItems: [],
  };
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["landing-page-builder", "page-one"], data);
  client.setQueryData(["landing-pages"], { items: [data.page] });
  client.setQueryData(["landing-page-templates"], { templates: [], schemaVersion: 2 });
  client.setQueryData(["landing-saved-templates"], { items: [] });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/landing-page?page=page-one"]}>
        <LandingPageBuilderPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, data };
}

describe("landing builder initial variant selection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens the published variant even when Main is first in the list", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("live-variant");
    expect(screen.getByLabelText("Previewed variant")).toHaveTextContent("Live shop");
    expect(screen.queryByRole("combobox", { name: "Landing page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All pages" })).not.toBeInTheDocument();
  });

  it("opens the first draft for an unpublished page", () => {
    setup({ isPublished: false });
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("main-variant");
  });

  it("falls back to the first draft when the published variant is missing", () => {
    setup({ publishedVariantId: "missing-variant" });
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("main-variant");
  });

  it("preserves a manually selected variant when builder data refreshes", async () => {
    const { client, data } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Variant" }), {
      target: { value: "main-variant" },
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("main-variant"),
    );
    await act(async () => {
      client.setQueryData(["landing-page-builder", "page-one"], {
        ...data,
        page: { ...data.page, revision: 2 },
      });
    });
    expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("main-variant");
    expect(screen.getByLabelText("Previewed variant")).toHaveTextContent("Main");
  });

  it("returns to the live variant when reopening the page from the page list", async () => {
    setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Variant" }), {
      target: { value: "main-variant" },
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Variant" })).toHaveValue("main-variant"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to landing pages" }));
    expect(await screen.findByRole("heading", { name: "Landing pages" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Landing page" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Open editor" }));
    expect(await screen.findByRole("combobox", { name: "Variant" })).toHaveValue("live-variant");
    expect(screen.getByLabelText("Previewed variant")).toHaveTextContent("Live shop");
  });

  it("saves pending changes before the back arrow returns to the page list", async () => {
    apiClient.sessionUserStore.set({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      phone: "",
      role: 0,
      roleName: "Owner",
      status: "ACTIVE",
      isApproved: true,
      emailVerified: true,
      isHighestRole: true,
      businessName: "Farm shop",
    });
    setup();
    let finishSave: (variant: LandingPageVariant) => void = () => {};
    const request = vi.spyOn(apiClient, "api").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Section name" }), {
      target: { value: "Updated section" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to landing pages" }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      "/landing-page/pages/page-one/variants/live-variant",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string).sections[0].name).toBe(
      "Updated section",
    );
    expect(screen.queryByRole("heading", { name: "Landing pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to landing pages" })).toBeDisabled();
    await act(async () => {
      finishSave({
        ...document("live-variant", "Live shop"),
        ...JSON.parse(request.mock.calls[0]?.[1]?.body as string),
        revision: 2,
      });
    });
    expect(await screen.findByRole("heading", { name: "Landing pages" })).toBeVisible();
  });
});
