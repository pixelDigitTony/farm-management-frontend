import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingBackground } from "@/components/landing-page/Background";
import { ResponsiveImage } from "@/components/landing-page/ResponsiveImage";
import { StoredImage } from "@/components/StoredImage";
import type { BackgroundSettings } from "@/types/landing-page";

vi.mock("@/components/landing-page/motion/LandingMotion", () => ({
  useLandingMotion: () => ({ mode: "PUBLIC", off: false }),
}));
const engine = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock("@/components/landing-page/background-engine", () => ({ mountBackground: engine.mount }));

const imageId = (n: number) => `/api/images/${n.toString(16).padStart(24, "0")}`;
const ok = () => ({ ok: true, status: 200, blob: async () => new Blob(["image"]) });
const failure = (status = 404) => ({ ok: false, status });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let observers: Array<{ element?: Element; callback: IntersectionObserverCallback }>;
let mediaListeners: Set<() => void>;
let mobile: boolean;
let fine: boolean;
beforeEach(() => {
  localStorage.clear();
  observers = [];
  mobile = false;
  fine = false;
  mediaListeners = new Set();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? mobile : query.includes("min-width") ? fine : false,
    addEventListener: (_name: string, fn: () => void) => mediaListeners.add(fn),
    removeEventListener: (_name: string, fn: () => void) => mediaListeners.delete(fn),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      item: { element?: Element; callback: IntersectionObserverCallback };
      constructor(callback: IntersectionObserverCallback) {
        this.item = { callback };
        observers.push(this.item);
      }
      observe(element: Element) {
        this.item.element = element;
      }
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok()));
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:${Math.random()}`);
      static revokeObjectURL = vi.fn();
    },
  );
  engine.mount.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function reveal(element: Element) {
  const item = observers.find((entry) => entry.element === element);
  if (!item) throw new Error("No observer for element");
  act(() =>
    item.callback(
      [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
function requiredElement(root: Element, selector: string): Element {
  const found = root.querySelector(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
const imageSettings = (url: string): BackgroundSettings =>
  ({
    mode: "IMAGE",
    color: "#ffffff",
    image: { url, focalPoint: { x: 0.2, y: 0.8 } },
  }) as BackgroundSettings;

describe("landing media performance", () => {
  it("defers a populated catalog until intersection while eagerly requesting the hero", async () => {
    render(
      <>
        <StoredImage src={imageId(100)} alt="hero" loading="eager" width={600} height={400} />
        {Array.from({ length: 30 }, (_, i) => (
          <StoredImage
            key={imageId(i + 1)}
            src={imageId(i + 1)}
            alt={`product ${i}`}
            loading="lazy"
            width={300}
            height={200}
          />
        ))}
      </>,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("product 0")).toHaveAttribute("width", "300");
    expect(screen.getByAltText("product 0")).toHaveAttribute("height", "200");
    reveal(screen.getByAltText("product 0"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain(
      imageId(1).replace("/api", "/public"),
    );
  });

  it("deduplicates simultaneous consumers, aborts only after the last releases, and revokes owned URLs", async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    vi.mocked(fetch).mockReturnValue(pending.promise as Promise<Response>);
    const first = render(<StoredImage src={imageId(101)} alt="first" />);
    const second = render(<StoredImage src={imageId(101)} alt="second" />);
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal as AbortSignal;
    first.unmount();
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve(ok()));
    await waitFor(() =>
      expect(screen.getByAltText("second").getAttribute("src")).toMatch(/^blob:/),
    );
    second.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    const third = render(<StoredImage src={imageId(102)} alt="third" />);
    const lastSignal = vi.mocked(fetch).mock.calls[1]?.[1]?.signal as AbortSignal;
    third.unmount();
    expect(lastSignal.aborted).toBe(true);
  });

  it("isolates token snapshots, uses public first and handles a private 401 retry or rejection", async () => {
    const publicOne = deferred<ReturnType<typeof failure>>();
    vi.mocked(fetch)
      .mockReturnValueOnce(publicOne.promise as Promise<Response>)
      .mockResolvedValueOnce(ok() as Response);
    localStorage.setItem("miss-v-token", "account-a");
    const a = render(<StoredImage src={imageId(103)} alt="a" />);
    localStorage.setItem("miss-v-token", "account-b");
    render(<StoredImage src={imageId(103)} alt="b" />);
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => publicOne.resolve(failure()));
    await waitFor(() =>
      expect(screen.getByAltText("a")).toHaveAttribute("data-image-state", "error"),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          (call) =>
            !String(call[0]).endsWith(`/images/${imageId(103).split("/").pop()}`) ||
            String(call[0]).includes("/public/"),
        ),
    ).toBe(true);
    a.unmount();
    cleanup();
    localStorage.setItem("miss-v-token", "valid");
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(failure() as Response)
      .mockResolvedValueOnce(ok() as Response);
    render(<StoredImage src={imageId(104)} alt="private" />);
    await waitFor(() =>
      expect(screen.getByAltText("private").getAttribute("src")).toMatch(/^blob:/),
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).toEqual({ Authorization: "Bearer valid" });
    expect(fetch).toHaveBeenCalledTimes(2);
    cleanup();
    localStorage.setItem("miss-v-token", "expired");
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(failure() as Response)
      .mockResolvedValueOnce(failure(401) as Response)
      .mockResolvedValueOnce(failure(401) as Response);
    render(<StoredImage src={imageId(105)} alt="denied" />);
    await waitFor(() =>
      expect(screen.getByAltText("denied")).toHaveAttribute("data-image-state", "error"),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls.map((call) => String(call[0]))).not.toContain(
      "/api/auth/refresh",
    );
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.headers).toEqual({
      Authorization: "Bearer expired",
    });
    expect(localStorage.getItem("miss-v-token")).toBe("expired");
    localStorage.setItem("miss-v-token", "renewed-by-session");
    vi.mocked(fetch)
      .mockResolvedValueOnce(failure() as Response)
      .mockResolvedValueOnce(ok() as Response);
    fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
    await waitFor(() =>
      expect(screen.getByAltText("denied").getAttribute("src")).toMatch(/^blob:/),
    );
    expect(vi.mocked(fetch).mock.calls[4]?.[1]?.headers).toEqual({
      Authorization: "Bearer renewed-by-session",
    });
  });

  it("surfaces failures and retries, cancels obsolete sources and ignores their late results", async () => {
    const old = deferred<ReturnType<typeof ok>>();
    vi.mocked(fetch)
      .mockReturnValueOnce(old.promise as Promise<Response>)
      .mockResolvedValueOnce(failure() as Response)
      .mockResolvedValueOnce(ok() as Response);
    const onError = vi.fn();
    const view = render(<StoredImage src={imageId(106)} alt="product" onError={onError} />);
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal as AbortSignal;
    view.rerender(<StoredImage src={imageId(107)} alt="product" onError={onError} />);
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    await act(async () => old.resolve(ok()));
    expect(screen.getByAltText("product")).not.toHaveAttribute("src");
    fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
    await waitFor(() =>
      expect(screen.getByAltText("product").getAttribute("src")).toMatch(/^blob:/),
    );
    expect(screen.queryByRole("button", { name: "Retry image" })).not.toBeInTheDocument();
  });

  it("keeps retry controls out of interactive parents and retries after reconnection", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(failure() as Response)
      .mockResolvedValueOnce(ok() as Response);
    const view = render(
      <button type="button">
        <ResponsiveImage src={imageId(110)} alt="select image" />
      </button>,
    );
    await waitFor(() =>
      expect(screen.getByAltText("select image")).toHaveAttribute("data-image-state", "error"),
    );
    expect(view.container.querySelector("button button")).toBeNull();
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(screen.getByAltText("select image").getAttribute("src")).toMatch(/^blob:/),
    );
  });

  it("ignores an obsolete intersection after the source changes", () => {
    const view = render(<StoredImage src={imageId(111)} alt="lazy" loading="lazy" />);
    const stale = observers[0];
    view.rerender(<StoredImage src={imageId(112)} alt="lazy" loading="lazy" />);
    if (!stale?.element) throw new Error("Missing old observer");
    act(() =>
      stale.callback(
        [{ isIntersecting: true, target: stale.element } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    reveal(screen.getByAltText("lazy"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps mobile source, crop and responsive sources and resets hero readiness on source changes", async () => {
    const events = vi.fn();
    const settings = imageSettings("https://example.test/desktop.jpg");
    if (settings.image) settings.image.mobileUrl = "https://example.test/mobile.jpg";
    const view = render(
      <LandingBackground settings={settings} eager onVisualStateChange={events} />,
    );
    const image = requiredElement(view.container, "img") as HTMLImageElement;
    expect(image).toHaveAttribute("loading", "eager");
    expect(image.style.objectPosition).toBe("20% 80%");
    expect(events).toHaveBeenLastCalledWith("loading");
    fireEvent.load(image);
    expect(events).toHaveBeenLastCalledWith("ready");
    mobile = true;
    act(() =>
      mediaListeners.forEach((listener) => {
        listener();
      }),
    );
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/mobile.jpg",
    );
    expect(events).toHaveBeenLastCalledWith("loading");
    fireEvent.error(requiredElement(view.container, "img"));
    expect(events).toHaveBeenLastCalledWith("fallback");
    view.rerender(
      <LandingBackground
        settings={imageSettings("https://example.test/new.jpg")}
        onVisualStateChange={events}
      />,
    );
    expect(events).toHaveBeenLastCalledWith("loading");
    fireEvent.load(image);
    expect(events).toHaveBeenLastCalledWith("loading");
    const responsive = render(
      <ResponsiveImage src="/wide.jpg" srcSet="/wide.jpg 1000w, /small.jpg 500w" alt="wide" />,
    );
    expect(responsive.getByAltText("wide")).toHaveAttribute(
      "srcset",
      "/wide.jpg 1000w, /small.jpg 500w",
    );
  });

  it("reports COLOR fallback, retains a ready poster on canvas failure and avoids callback loops", async () => {
    const events = vi.fn();
    const view = render(
      <LandingBackground
        settings={{ mode: "COLOR", color: "#fff" } as BackgroundSettings}
        onVisualStateChange={events}
      />,
    );
    expect(events).toHaveBeenLastCalledWith("fallback");
    fine = true;
    const three = {
      mode: "THREE_D",
      color: "#fff",
      threeD: { sceneId: "farm-scenery", motion: "SUBTLE" },
    } as BackgroundSettings;
    engine.mount.mockImplementation((_host, _scene, options) => {
      options.onFailure();
    });
    view.rerender(<LandingBackground settings={three} onVisualStateChange={events} />);
    const img = requiredElement(view.container, "img");
    fireEvent.load(img);
    expect(events).toHaveBeenLastCalledWith("ready");
    reveal(requiredElement(view.container, ".lp-background"));
    await waitFor(() => expect(engine.mount).toHaveBeenCalled());
    expect(events).toHaveBeenLastCalledWith("ready");
    const count = events.mock.calls.length;
    view.rerender(
      <LandingBackground settings={three} onVisualStateChange={(state) => events(state)} />,
    );
    expect(events).toHaveBeenCalledTimes(count);
    fireEvent.error(img);
    expect(events).toHaveBeenLastCalledWith("fallback");
  });

  it("ignores failure from an obsolete canvas after a replacement is ready", async () => {
    fine = true;
    const callbacks: Array<{ onReady: () => void; onFailure: () => void }> = [];
    engine.mount.mockImplementation((_host, _scene, options) => {
      callbacks.push(options);
    });
    const events = vi.fn();
    const settings = {
      mode: "THREE_D",
      color: "#fff",
      threeD: { sceneId: "farm-scenery", motion: "SUBTLE" },
    } as BackgroundSettings;
    const view = render(<LandingBackground settings={settings} onVisualStateChange={events} />);
    fireEvent.error(requiredElement(view.container, "img"));
    reveal(requiredElement(view.container, ".lp-background"));
    await waitFor(() => expect(callbacks).toHaveLength(1));
    act(() =>
      mediaListeners.forEach((listener) => {
        listener();
      }),
    );
    const latest = observers.at(-1);
    if (!latest?.element) throw new Error("Missing replacement observer");
    act(() =>
      latest.callback(
        [{ isIntersecting: true, target: latest.element } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() => expect(callbacks).toHaveLength(2));
    act(() => callbacks[1]?.onReady());
    expect(events).toHaveBeenLastCalledWith("ready");
    act(() => callbacks[0]?.onFailure());
    expect(events).toHaveBeenLastCalledWith("ready");
  });
});
