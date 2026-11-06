import "./landing-media.css";
import { type ImgHTMLAttributes, useEffect, useRef, useState } from "react";
import { acquireStoredImage } from "@/lib/landing-page/stored-image-loader";

export const isStoredImage = (url?: string) => /^\/api\/images\/[a-f0-9]{24}$/.test(url ?? "");

export function StoredImage({
  src,
  alt,
  loading,
  onError,
  onLoad,
  picture = false,
  placeholder,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { picture?: boolean; placeholder?: "skeleton" }) {
  const image = useRef<HTMLImageElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [visibleSrc, setVisibleSrc] = useState<string>();
  const [result, setResult] = useState<{ src: string; attempt: number; url: string }>();
  const [failure, setFailure] = useState<{ src?: string; attempt: number }>();
  const [ready, setReady] = useState<{ src?: string; attempt: number }>();
  const generation = useRef(0);
  const state = !src
    ? "empty"
    : failure?.src === src && failure.attempt === attempt
      ? "error"
      : ready?.src === src && ready.attempt === attempt
        ? "ready"
        : "loading";
  // biome-ignore lint/correctness/useExhaustiveDependencies: Invalidate decode completions on every source/retry change and on unmount.
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [src, attempt]);
  const stored = isStoredImage(src);
  const visible = loading !== "lazy" || visibleSrc === src;
  const failed = failure !== undefined && failure.src === src && failure.attempt === attempt;

  useEffect(() => {
    if (!src || !stored || loading !== "lazy") {
      return;
    }
    const element = image.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisibleSrc(src);
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          setVisibleSrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [src, stored, loading]);

  useEffect(() => {
    if (!src || !stored || !visible) return;
    const request = acquireStoredImage(src);
    let active = true;
    let objectUrl = "";
    void request.promise
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ src, attempt, url: objectUrl });
      })
      .catch(() => {
        if (!active) return;
        setFailure({ src, attempt });
        image.current?.dispatchEvent(new Event("error"));
      });
    return () => {
      active = false;
      request.release();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, stored, visible, attempt]);

  useEffect(() => {
    if (!failed) return;
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new source, attempt, or resolved blob may already be in the browser cache.
  useEffect(() => {
    const element = image.current;
    if (placeholder && element?.complete && element.naturalWidth > 0)
      element.dispatchEvent(new Event("load"));
  }, [src, attempt, result, placeholder]);

  const element = (
    <img
      {...props}
      key={`${src ?? ""}:${attempt}`}
      ref={image}
      alt={alt}
      loading={loading}
      src={
        stored
          ? result && result.src === src && result.attempt === attempt
            ? result.url
            : undefined
          : src
      }
      data-image-state={placeholder ? state : failed ? "error" : undefined}
      style={{ ...props.style, ...(placeholder && state !== "ready" ? { opacity: 0 } : {}) }}
      onError={(event) => {
        setFailure({ src, attempt });
        onError?.(event);
      }}
      onLoad={(event) => {
        if (!placeholder) {
          setFailure(undefined);
          onLoad?.(event);
          return;
        }
        const element = event.currentTarget;
        if (!element.currentSrc && !element.getAttribute("src")) return;
        const version = generation.current;
        const complete = () => {
          if (generation.current !== version) return;
          setFailure(undefined);
          setReady({ src, attempt });
          onLoad?.({ ...event, currentTarget: element });
        };
        if (!element.decode) complete();
        else
          void element.decode().then(complete, () => {
            if (generation.current === version) {
              setFailure({ src, attempt });
              onError?.({ ...event, currentTarget: element });
            }
          });
      }}
    />
  );
  if (placeholder)
    return (
      <span
        className="landing-media"
        data-media-state={state}
        aria-busy={state === "loading"}
        style={{
          aspectRatio:
            props.style?.aspectRatio ??
            (props.width && props.height ? `${props.width}/${props.height}` : "4 / 3"),
        }}
      >
        {picture ? <picture>{element}</picture> : element}
        {state === "loading" && <span className="landing-media-skeleton" aria-hidden="true" />}
        {state === "error" && alt && <span className="landing-media-error">Image unavailable</span>}
        {state === "error" && alt && !image.current?.closest("button, a, [role='button']") && (
          <button
            className="landing-media-retry"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry image
          </button>
        )}
      </span>
    );
  return (
    <>
      {picture ? <picture>{element}</picture> : element}
      {failed && alt && !image.current?.closest("button, a, [role='button']") && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Retry image
        </button>
      )}
    </>
  );
}
