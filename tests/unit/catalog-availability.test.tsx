import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/api/client";
import { CatalogPage } from "@/pages/CatalogPage";
import type { CatalogProduct } from "@/types/domain";

const product: CatalogProduct = {
  _id: "product-one",
  productCode: "ONE",
  name: "Harvest basket",
  description: "",
  category: "Harvest",
  productType: "FARM_PRODUCT",
  mediaUrls: [],
  basePrice: 100,
  availableQuantity: null,
  variants: [],
  isFeatured: false,
  isOrderable: true,
  isActive: true,
  revision: 1,
  availabilitySchedule: { mode: "WEEKDAYS", timezone: "Asia/Manila", weekdays: [1] },
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
};

function setup() {
  const data = { items: [product], serverTime: "2026-10-19T00:00:00Z", timezone: "Asia/Manila" };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(["catalog-products"], data);
  render(
    <QueryClientProvider client={client}>
      <CatalogPage />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Schedule availability" }));
  return { data, dialog: within(screen.getByRole("dialog")) };
}

describe("catalog availability save recovery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retains edits through a failed latest-version lookup and rebases only after explicit review", async () => {
    const latest: CatalogProduct = {
      ...product,
      revision: 7,
      isActive: false,
      availabilitySchedule: { mode: "CUSTOM_DATES", timezone: "UTC", dates: ["2030-01-01"] },
    };
    const saves: Array<{ expectedRevision: number; availabilitySchedule: unknown }> = [];
    let lookups = 0;
    const request = vi.spyOn(apiClient, "api").mockImplementation(async (path, options) => {
      if (options?.method === "PATCH") {
        const payload = JSON.parse(String(options.body));
        saves.push(payload);
        if (saves.length === 1)
          throw new apiClient.ApiError(
            "Availability changed in another editor. Reload before saving.",
            409,
            "PRODUCT_REVISION_CONFLICT",
          );
        return { ...latest, ...payload, revision: 8 };
      }
      if (path === "/catalog/products") {
        lookups++;
        if (lookups === 1) throw new Error("Cannot load latest availability. Retry.");
        return { items: [latest], serverTime: "2026-10-19T00:00:00Z" };
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const { dialog } = setup();
    expect(dialog.queryByRole("heading", { name: "Availability" })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Friday" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save availability" }));
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Save availability" })).toBeDisabled(),
    );
    expect(dialog.getByRole("checkbox", { name: "Friday" })).toBeChecked();
    fireEvent.click(dialog.getByRole("button", { name: "Review latest version" }));
    await waitFor(() =>
      expect(dialog.getByText("Cannot load latest availability. Retry.")).toBeVisible(),
    );
    expect(dialog.getByRole("checkbox", { name: "Friday" })).toBeChecked();
    fireEvent.click(dialog.getByRole("button", { name: "Review latest version" }));
    await waitFor(() =>
      expect(dialog.getByRole("heading", { name: "Latest saved availability" })).toBeVisible(),
    );
    expect(dialog.getByText("2030-01-01")).toBeVisible();
    expect(dialog.getByRole("checkbox", { name: "Friday" })).toBeChecked();
    expect(saves).toHaveLength(1);
    fireEvent.click(dialog.getByRole("button", { name: "Keep my changes" }));
    expect(dialog.getByRole("button", { name: "Save availability" })).toBeEnabled();
    expect(saves).toHaveLength(1);
    fireEvent.click(dialog.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saves[1]).toMatchObject({
      expectedRevision: 7,
      availabilitySchedule: { mode: "WEEKDAYS", weekdays: [1, 5], timezone: "Asia/Manila" },
    });
    expect(request).toHaveBeenCalled();
  });

  it("can adopt the latest saved availability without submitting a write", async () => {
    const latest: CatalogProduct = {
      ...product,
      revision: 4,
      isActive: false,
      availabilitySchedule: { mode: "ALWAYS", timezone: "UTC" },
    };
    let saves = 0;
    vi.spyOn(apiClient, "api").mockImplementation(async (_path, options) => {
      if (options?.method === "PATCH") {
        saves++;
        throw new apiClient.ApiError(
          "Availability changed in another editor.",
          409,
          "PRODUCT_REVISION_CONFLICT",
        );
      }
      return { items: [latest], serverTime: "2026-10-19T00:00:00Z" };
    });
    const { dialog } = setup();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Friday" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save availability" }));
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Review latest version" })).toBeVisible(),
    );
    fireEvent.click(dialog.getByRole("button", { name: "Review latest version" }));
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Use latest availability" })).toBeVisible(),
    );
    fireEvent.click(dialog.getByRole("button", { name: "Use latest availability" }));
    expect(dialog.getByRole("checkbox", { name: "Product enabled" })).not.toBeChecked();
    expect(dialog.getByRole("checkbox", { name: "Always available" })).toBeChecked();
    expect(dialog.queryByLabelText("Schedule mode")).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Save availability" })).toBeEnabled();
    expect(saves).toBe(1);
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule availability" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    expect(screen.getByRole("checkbox", { name: "Monday" })).not.toBeChecked();
  });
});
