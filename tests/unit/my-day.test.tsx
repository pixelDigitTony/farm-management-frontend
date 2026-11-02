import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyDayDialog } from "../../src/components/landing-page/MyDayDialog";
import { displayDay, localInstants, myDayStorageKey, zonedInput } from "../../src/lib/my-day";
import type { LandingCatalogItem } from "../../src/types/landing-page";

vi.mock("../../src/components/StoredImage", () => ({
  StoredImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
}));
const start = "2030-01-01T00:00:00.000Z";
const campaign = {
  id: "campaign",
  revision: 1,
  heading: "Harvest",
  description: "Fresh picks",
  startsAt: start,
  endsAt: "2030-01-02T00:00:00Z",
  productKeys: ["PRODUCT:p1", "PRODUCT:p2"],
};
const items = ["p1", "p2"].map((id, i) => ({
  key: `PRODUCT:${id}`,
  sourceId: id,
  sourceType: "PRODUCT",
  name: `Harvest ${i + 1}`,
  description: "Details",
  price: 100,
  mediaUrls: [],
  variants: [],
  isAvailable: true,
  isFeatured: false,
  productType: "OTHER",
})) as LandingCatalogItem[];
const props = {
  campaign,
  items,
  theme: {
    primaryColor: "#123456",
    backgroundColor: "#ffffff",
    surfaceColor: "#ffffff",
    textColor: "#111111",
    fontStyle: "MODERN",
    buttonStyle: "ROUNDED",
  } as const,
  businessId: "business",
  pageId: "page",
  frequency: { timezone: "Asia/Manila", localDate: "2030-01-01" },
  serverTime: start,
  receivedAt: 1,
  fresh: true,
  blocked: false,
  goal: "CATALOG",
  orderingEnabled: false,
  onAdd: vi.fn(),
  onOpenChange: vi.fn(),
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = (time = 2500) => act(() => vi.advanceTimersByTime(time));
describe("My Day date handling", () => {
  it("converts Manila inputs independently of the browser timezone", () => {
    expect(localInstants("2030-01-01T08:00", "Asia/Manila")).toEqual([start]);
    expect(zonedInput(start, "Asia/Manila")).toBe("2030-01-01T08:00");
    expect(displayDay(Date.parse("2030-01-01T16:00Z"), "Asia/Manila")).toBe("2030-01-02");
  });
  it("rejects impossible dates and DST gaps, and enumerates DST folds", () => {
    expect(localInstants("2030-02-30T08:00", "Asia/Manila")).toEqual([]);
    expect(localInstants("2026-03-08T02:30", "America/New_York")).toEqual([]);
    expect(localInstants("2026-11-01T01:30", "America/New_York")).toEqual([
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:30:00.000Z",
    ]);
  });
});
describe("My Day dialog lifecycle", () => {
  it("defers while typing and honors another tab's presentation record", () => {
    vi.useFakeTimers();
    render(
      <>
        <input aria-label="Contact message" />
        <MyDayDialog {...props} />
      </>,
    );
    const input = screen.getByLabelText("Contact message");
    input.focus();
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    input.blur();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: myDayStorageKey("business", "page"),
        newValue: "2030-01-01",
      }),
    );
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("permits a new day's automatic presentation only after a fresh server response", () => {
    vi.useFakeTimers();
    localStorage.setItem(myDayStorageKey("business", "page"), "2030-01-01");
    const longer = { ...campaign, endsAt: "2030-01-04T00:00:00Z" };
    const { rerender } = render(<MyDayDialog {...props} campaign={longer} />);
    rerender(
      <MyDayDialog
        {...props}
        campaign={longer}
        fresh={false}
        receivedAt={2}
        serverTime="2030-01-02T00:00:00Z"
      />,
    );
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <MyDayDialog
        {...props}
        campaign={longer}
        receivedAt={2}
        serverTime="2030-01-02T00:00:00Z"
        frequency={{ timezone: "Asia/Manila", localDate: "2030-01-02" }}
      />,
    );
    advance();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(localStorage.getItem(myDayStorageKey("business", "page"))).toBe("2030-01-02");
  });
  it("opens after delay, navigates, dismisses and remembers actual presentation", () => {
    vi.useFakeTimers();
    render(<MyDayDialog {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    advance();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(localStorage.getItem(myDayStorageKey("business", "page"))).toBe("2030-01-01");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Harvest 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My Day" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("waits for conflicting flows and requires a successful response", () => {
    vi.useFakeTimers();
    const { rerender } = render(<MyDayDialog {...props} blocked />);
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<MyDayDialog {...props} fresh={false} />);
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<MyDayDialog {...props} />);
    advance();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("never auto-opens again on reload or campaign replacement the same day", () => {
    vi.useFakeTimers();
    localStorage.setItem(myDayStorageKey("business", "page"), "2030-01-01");
    render(<MyDayDialog {...props} campaign={{ ...campaign, id: "replacement" }} />);
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("closes at expiry even with a failed network request and skewed wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("1990-01-01"));
    const soon = { ...campaign, endsAt: "2030-01-01T00:00:04Z" };
    const { rerender } = render(<MyDayDialog {...props} campaign={soon} />);
    advance();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(<MyDayDialog {...props} campaign={soon} fresh={false} />);
    advance(2000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My Day" })).not.toBeInTheDocument();
  });
  it("survives denied storage, handles product removal and closes replacement content", () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { rerender } = render(<MyDayDialog {...props} />);
    advance();
    rerender(<MyDayDialog {...props} campaign={{ ...campaign, productKeys: ["PRODUCT:p2"] }} />);
    expect(screen.getByText("Harvest 2")).toBeInTheDocument();
    rerender(<MyDayDialog {...props} campaign={{ ...campaign, id: "replacement" }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    advance();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
