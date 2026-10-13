import { LazyMotion, m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { MotionSettings } from "@/types/landing-page";

export type RenderMode = "EDIT" | "PREVIEW" | "PUBLIC";
const Context = createContext({
  mode: "PUBLIC" as RenderMode,
  off: false,
  small: false,
  strength: 1,
});
const features = () => import("./features").then((m) => m.default);
export function LandingMotionProvider({
  mode = "PUBLIC",
  level,
  children,
}: {
  mode?: RenderMode;
  level?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const [preferences, setPreferences] = useState({
    small: matchMedia("(max-width:767px)").matches,
    reduced: matchMedia("(prefers-reduced-motion:reduce)").matches,
  });
  useEffect(() => {
    const mobile = matchMedia("(max-width:767px)"),
      reduce = matchMedia("(prefers-reduced-motion:reduce)");
    const update = () => setPreferences({ small: mobile.matches, reduced: reduce.matches });
    mobile.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        mode,
        off: mode === "EDIT" || level === "OFF" || Boolean(reduced) || preferences.reduced,
        small: preferences.small,
        strength: level === "EXPRESSIVE" ? 1 : 0.7,
      }}
    >
      <LazyMotion features={features}>{children}</LazyMotion>
    </Context.Provider>
  );
}
export function useLandingMotion() {
  return useContext(Context);
}
export function MotionBlock({
  settings,
  children,
  className,
}: {
  settings?: MotionSettings;
  children: React.ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { off, small, strength } = useLandingMotion();
  const preset = settings?.preset;
  const mobile = settings?.mobile;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (off || (preset !== "REVEAL" && preset !== "IMAGE_REVEAL")) return;
    const element = root.current;
    if (!element) return;
    if (small && mobile === "STATIC") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [off, small, preset, mobile]);
  useEffect(() => {
    if (!ready || off || (small && mobile === "STATIC") || preset !== "IMAGE_REVEAL") return;
    // Clip only imagery: section wrappers must not clip sticky content, focus rings or text.
    const animations = Array.from(root.current?.querySelectorAll("img") ?? []).map((image) =>
      image.animate?.([{ clipPath: "inset(0 0 6% 0)" }, { clipPath: "inset(0)" }], {
        duration: settings?.durationMs ?? 450,
        easing: "ease-out",
      }),
    );
    return () => {
      for (const animation of animations) animation?.cancel();
    };
  }, [ready, off, small, mobile, preset, settings?.durationMs]);
  return (
    <m.div
      ref={root}
      className={className}
      initial={false}
      animate={
        ready && !off && !(small && settings?.mobile === "STATIC")
          ? settings?.preset === "IMAGE_REVEAL"
            ? { y: 0, opacity: 1, clipPath: "none" }
            : {
                y: [(small ? 8 : settings?.intensity === "STANDARD" ? 12 : 8) * strength, 0],
                opacity: [0.8, 1],
              }
          : { y: 0, opacity: 1, clipPath: "none" }
      }
      transition={{ duration: (settings?.durationMs ?? 450) / 1000 }}
    >
      {children}
    </m.div>
  );
}
export function DepthPlane({
  depth,
  children,
  className,
}: {
  depth: number;
  children: React.ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { off, small, strength } = useLandingMotion();
  const { scrollYProgress } = useScroll({ target: root, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-depth * strength, depth * strength]);
  return (
    <m.div ref={root} className={className} style={off || small ? undefined : { y }}>
      {children}
    </m.div>
  );
}
