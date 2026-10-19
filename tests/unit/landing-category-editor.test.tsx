import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BlockInspector } from "@/components/landing-page/editor/Inspector";
import {
  createLandingComponent,
  createLandingSection,
  defaultLandingPageCommerceSettings,
  type LandingPageComponent,
  type LandingPageVariant,
} from "@/types/landing-page";

const future = "507f1f77bcf86cd799439011";
function Editor() {
  const [block, setBlock] = useState<LandingPageComponent>(() => createLandingComponent("CATALOG"));
  const draft: LandingPageVariant = {
    _id: "draft",
    name: "Draft",
    theme: {
      primaryColor: "#be185d",
      backgroundColor: "#ffffff",
      surfaceColor: "#ffffff",
      textColor: "#222222",
      fontStyle: "CLASSIC",
      buttonStyle: "ROUNDED",
    },
    commerce: defaultLandingPageCommerceSettings,
    sections: [createLandingSection("Main", [block])],
  };
  return (
    <>
      <BlockInspector block={block} draft={draft} catalog={[]} onChange={setBlock} />
      <output aria-label="Block document">{JSON.stringify(block)}</output>
    </>
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["landing-categories"], {
    items: [
      { _id: future, name: "Future harvest", sourceType: "PRODUCT", total: 40, activeNow: 0 },
      {
        _id: "507f1f77bcf86cd799439012",
        name: "Bakery",
        sourceType: "PRODUCT",
        total: 3,
        activeNow: 2,
      },
    ],
  });
  render(
    <QueryClientProvider client={client}>
      <Editor />
    </QueryClientProvider>,
  );
}
const saved = () => JSON.parse(screen.getByLabelText("Block document").textContent ?? "{}");
describe("landing collection category editor", () => {
  it("selects entire categories even if no products are active and preserves binding during content edits", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Category selection mode"), {
      target: { value: "SELECTED_CATEGORIES" },
    });
    const checkbox = screen.getByRole("checkbox", { name: /Future harvest — products/ });
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(saved().content.categoryBinding).toEqual({
      mode: "SELECTED_CATEGORIES",
      categoryIds: [future],
    });
    expect(saved().content.catalogItemRefs).toEqual([]);
    fireEvent.change(screen.getByLabelText("Heading"), {
      target: { value: "Our seasonal products" },
    });
    expect(saved().content.categoryBinding.categoryIds).toEqual([future]);
    expect(saved().content.heading).toBe("Our seasonal products");
  });
  it("keeps clear selection separate from all categories", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Category selection mode"), {
      target: { value: "SELECTED_CATEGORIES" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select all listed" }));
    expect(saved().content.categoryBinding.categoryIds).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(saved().content.categoryBinding).toEqual({
      mode: "SELECTED_CATEGORIES",
      categoryIds: [],
    });
    fireEvent.change(screen.getByLabelText("Category selection mode"), {
      target: { value: "ALL_CATEGORIES" },
    });
    expect(saved().content.categoryBinding).toEqual({ mode: "ALL_CATEGORIES" });
  });
});
