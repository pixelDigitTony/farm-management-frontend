import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countdown, discountStatus, effectivePrice, useCatalogClock, useCatalogPricingClock } from "@/lib/catalog-discounts";

afterEach(() => vi.useRealTimers());
const discount = { id: "discount", name: "Sale", type: "PERCENTAGE" as const, value: 10, startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-02T00:00:00Z", isEnabled: true };
describe("catalog price boundaries", () => {
  it("keeps pricing renders stable between boundaries while countdowns tick", () => {
    vi.useFakeTimers();
    const start = Date.parse(discount.startsAt);
    vi.setSystemTime(start - 120_000);
    const receivedAt = Date.now();
    const serverTime = new Date(receivedAt).toISOString();
    let renders = 0;
    const pricing = renderHook(() => {
      renders += 1;
      return useCatalogPricingClock([discount], serverTime, receivedAt);
    });
    const clock = renderHook(() => useCatalogClock());
    const initialRenders = renders;
    for (let second = 0; second < 119; second += 1) {
      act(() => vi.advanceTimersByTime(1000));
    }
    expect(renders).toBe(initialRenders);
    expect(countdown(discount.startsAt, clock.result.current)).toBe("00:00:01");
    act(() => vi.advanceTimersByTime(1000));
    expect(renders).toBe(initialRenders + 1);
    expect(discountStatus(discount, pricing.result.current)).toBe("Active");
    act(() => vi.advanceTimersByTime(24 * 3600_000));
    expect(discountStatus(discount, pricing.result.current)).toBe("Expired");
    pricing.unmount();
    clock.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("activates at the start and restores the original price at the end", () => {
    const start = Date.parse(discount.startsAt), end = Date.parse(discount.endsAt);
    expect(discountStatus(discount, start - 1)).toBe("Scheduled");
    expect(discountStatus(discount, start)).toBe("Active");
    expect(discountStatus(discount, end)).toBe("Expired");
    const pricing = { originalPrice: 100, discountedPrice: 90, discount };
    expect(effectivePrice(pricing, start)).toBe(90);
    expect(effectivePrice(pricing, end)).toBe(100);
  });
  it("preserves hours above 24 and clamps expired countdowns", () => {
    const now = Date.parse(discount.startsAt);
    expect(countdown(new Date(now + (125 * 3600 + 4 * 60 + 9) * 1000).toISOString(), now)).toBe("125:04:09");
    expect(countdown(discount.startsAt, now + 1)).toBe("00:00:00");
  });
  it("shares one timer, tolerates StrictMode and removes it after the last subscriber", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>;
    const receivedAt = Date.now();
    const first = renderHook(() => useCatalogClock("2026-09-01T01:00:00Z", receivedAt), { wrapper });
    const second = renderHook(() => useCatalogClock());
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(second.result.current).toBe(Date.parse("2026-09-01T01:00:01Z"));
    first.unmount(); expect(vi.getTimerCount()).toBe(1);
    second.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
