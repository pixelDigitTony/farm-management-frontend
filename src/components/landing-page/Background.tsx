import { useEffect, useRef, useState } from "react";
import pack from "@/lib/landing-page/assets.json";
import type { BackgroundSettings } from "@/types/landing-page";
import { useLandingMotion } from "./motion/LandingMotion";
export function LandingBackground({ settings }: { settings?: BackgroundSettings }) {
  const root = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null);
  const { mode, off } = useLandingMotion();
  const [loaded, setLoaded] = useState(false);
  const scene = pack.scenes.find((s) => s.id === settings?.threeD?.sceneId);
  const backgroundMode = settings?.mode;
  const backgroundColor = settings?.color ?? "#F5F1EB";
  const backgroundMotion = settings?.threeD?.motion;
  const cameraPreset = settings?.threeD?.cameraPreset;
  const mobileCamera = settings?.threeD?.cameraPreset === "MOBILE";
  const url =
    settings?.mode === "THREE_D"
      ? mobileCamera
        ? scene?.mobilePoster
        : scene?.poster
      : settings?.mode === "IMAGE"
        ? settings.image?.url
        : undefined;
  useEffect(() => {
    setLoaded(false);
    const element = host.current,
      boundary = root.current;
    if (!element || !boundary || !scene || backgroundMode !== "THREE_D" || mode === "EDIT") return;
    const canvasHost = element,
      canvasBoundary = boundary,
      selectedScene = scene;
    let stopped = false;
    let controller: AbortController | undefined;
    let observer: IntersectionObserver | undefined;
    const media = matchMedia("(min-width:1024px) and (pointer:fine)"),
      reduced = matchMedia("(prefers-reduced-motion:reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          addEventListener?: (type: string, cb: () => void) => void;
          removeEventListener?: (type: string, cb: () => void) => void;
        };
      }
    ).connection;
    const eligible = () => !stopped && media.matches && !reduced.matches && !connection?.saveData;
    function configure() {
      observer?.disconnect();
      controller?.abort();
      controller = undefined;
      setLoaded(false);
      if (!eligible()) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return;
          observer?.disconnect();
          const pending = new AbortController();
          controller = pending;
          void import("./background-engine")
            .then((engine) => {
              if (pending.signal.aborted || !eligible()) return;
              return engine.mountBackground(canvasHost, selectedScene, {
                motion: !off && backgroundMotion === "SUBTLE",
                color: backgroundColor,
                cameraPreset,
                signal: pending.signal,
                onReady: () => {
                  if (!pending.signal.aborted && eligible()) setLoaded(true);
                },
                onFailure: () => {
                  if (!stopped) setLoaded(false);
                },
              });
            })
            .catch(() => {
              if (!stopped) setLoaded(false);
            });
        },
        { rootMargin: "80px" },
      );
      observer.observe(canvasBoundary);
    }
    media.addEventListener("change", configure);
    reduced.addEventListener("change", configure);
    connection?.addEventListener?.("change", configure);
    configure();
    return () => {
      stopped = true;
      observer?.disconnect();
      controller?.abort();
      media.removeEventListener("change", configure);
      reduced.removeEventListener("change", configure);
      connection?.removeEventListener?.("change", configure);
    };
  }, [backgroundMode, cameraPreset, backgroundMotion, backgroundColor, mode, off, scene]);
  return (
    <div
      ref={root}
      className="lp-background"
      aria-hidden="true"
      style={{ background: settings?.color }}
    >
      {url && (
        <picture>
          <source
            media="(max-width:767px)"
            srcSet={
              settings?.mode === "THREE_D"
                ? scene?.mobilePoster
                : (settings?.image?.mobileUrl ?? url)
            }
          />
          <img
            key={url}
            src={url}
            alt=""
            fetchPriority="high"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            style={
              settings?.mode === "IMAGE"
                ? {
                    objectPosition: `${(settings.image?.focalPoint.x ?? 0.5) * 100}% ${(settings.image?.focalPoint.y ?? 0.5) * 100}%`,
                  }
                : undefined
            }
          />
        </picture>
      )}
      <div ref={host} className="lp-background-canvas" style={{ opacity: loaded ? 1 : 0 }} />
      {settings?.mode === "THREE_D" && (
        <div
          className="lp-background-overlay"
          style={{ background: `rgba(0,0,0,${settings.threeD?.overlayOpacity ?? 0})` }}
        />
      )}
    </div>
  );
}
