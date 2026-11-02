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
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { picture?: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [visibleSrc, setVisibleSrc] = useState<string>();
  const [result, setResult] = useState<{ src: string; attempt: number; url: string }>();
  const [failure, setFailure] = useState<{ src?: string; attempt: number }>();
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
      data-image-state={failed ? "error" : undefined}
      onError={(event) => {
        setFailure({ src, attempt });
        onError?.(event);
      }}
      onLoad={(event) => {
        setFailure(undefined);
        onLoad?.(event);
      }}
    />
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
