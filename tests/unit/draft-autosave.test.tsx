import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";

afterEach(() => vi.useRealTimers());

describe("draft autosave", () => {
  it("debounces typing and saves only the latest draft", async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(persist));
    act(() => result.current.schedule({ title: "First" }));
    act(() => result.current.schedule({ title: "Latest" }));
    expect(persist).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(persist).toHaveBeenCalledExactlyOnceWith({ title: "Latest" });
    expect(result.current.status).toBe("saved");
  });

  it("serializes edits made during an in-flight save and flush waits for both", async () => {
    let complete!: () => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(persist));
    act(() => result.current.schedule("First"));
    let finished!: Promise<boolean>;
    act(() => {
      finished = result.current.flush();
    });
    act(() => result.current.schedule("Newest"));
    expect(persist).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete();
      await finished;
    });
    expect(persist.mock.calls).toEqual([["First"], ["Newest"]]);
    expect(result.current.status).toBe("saved");
  });

  it("retains failed changes for Retry and reports the real save error", async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("Invalid heading"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftAutosave(persist));
    act(() => result.current.schedule("My draft"));
    await act(async () => {
      expect(await result.current.flush()).toBe(false);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Invalid heading");
    await act(async () => {
      expect(await result.current.flush()).toBe(true);
    });
    expect(persist.mock.calls).toEqual([["My draft"], ["My draft"]]);
    expect(result.current.status).toBe("saved");
  });

  it("reset discards pending changes and waits for an older failed save", async () => {
    let fail!: (cause: Error) => void;
    const persist = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { result } = renderHook(() => useDraftAutosave(persist));
    act(() => result.current.schedule("In flight"));
    act(() => {
      void result.current.flush();
    });
    act(() => result.current.schedule("Queued"));
    let discarded!: Promise<void>;
    act(() => {
      discarded = result.current.discard();
    });
    await act(async () => {
      fail(new Error("Network error"));
      await discarded;
    });
    await act(async () => {
      expect(await result.current.flush()).toBe(true);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });

  it("flushes a debounced edit when leaving the editor", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useDraftAutosave(persist));
    act(() => result.current.schedule("Leaving"));
    unmount();
    expect(persist).toHaveBeenCalledExactlyOnceWith("Leaving");
  });
});
