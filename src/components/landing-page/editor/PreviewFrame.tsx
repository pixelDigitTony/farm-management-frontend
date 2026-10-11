import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingCatalogItem, LandingMenuItem, LandingPageVariant } from "@/types/landing-page";
import type { RenderMode } from "../motion/LandingMotion";
export type PreviewPayload = {
  draft: LandingPageVariant;
  catalogItems: LandingCatalogItem[];
  menuItems: LandingMenuItem[];
  mode: RenderMode;
  selectedId?: string;
  motionOff?: boolean;
};
export function PreviewFrame({
  payload,
  width,
  onSelect,
}: {
  payload: PreviewPayload;
  width: number;
  onSelect: (id: string, sectionId: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useRef(crypto.randomUUID());
  const latest = useRef(payload);
  latest.current = payload;
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ zoom: 1, height: 700 });
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const resize = () => {
      const zoom = Math.min(1, element.clientWidth / width);
      setSize({ zoom, height: Math.max(400, element.clientHeight) / zoom });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [width]);
  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "LP_DOCUMENT", nonce: nonce.current, payload: latest.current },
      location.origin,
    );
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.nonce !== nonce.current
      )
        return;
      if (event.data.type === "LP_READY") send();
      if (
        event.data.type === "LP_SELECT" &&
        typeof event.data.id === "string" &&
        typeof event.data.sectionId === "string"
      ) {
        const s = latest.current.draft.sections.find((s) => s.id === event.data.sectionId);
        if (s?.components.some((c) => c.id === event.data.id))
          selection.current(event.data.id, event.data.sectionId);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [send]);
  useEffect(() => {
    latest.current = payload;
    send();
  }, [payload, send]);
  return (
    <div ref={stage} className="lb-preview-stage" style={{ maxWidth: width }}>
      <iframe
        ref={frame}
        title={`${payload.mode === "EDIT" ? "Editable" : "Interactive"} landing page at ${width} pixels`}
        src={`/landing-preview?nonce=${nonce.current}`}
        sandbox="allow-scripts allow-same-origin allow-popups"
        onLoad={send}
        className="lb-preview-frame"
        style={{ width, height: size.height, transform: `scale(${size.zoom})` }}
      />
    </div>
  );
}
