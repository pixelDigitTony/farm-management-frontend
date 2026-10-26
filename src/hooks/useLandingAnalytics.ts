import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";

type Identity = { visitorId: string; sessionId: string; lastActivity: number; expiresAt: number };
type Event = {
  eventId: string;
  visitorId: string;
  sessionId: string;
  type: string;
  occurredAt: string;
  componentId?: string;
  referrerHost?: string;
  deviceCategory: string;
};
const random = () => crypto.randomUUID();
export function useLandingAnalytics(slug: string, pageId: string | undefined, enabled: boolean) {
  const key = pageId ? `miss-v-analytics:${pageId}` : "";
  const [preference, setPreference] = useState<"unknown" | "accepted" | "declined">("unknown");
  const [preferenceScope, setPreferenceScope] = useState("");
  const queue = useRef<Event[]>([]);
  const identity = useRef<Identity | undefined>(undefined);
  const viewed = useRef("");
  const checkout = useRef(new Set<string>());
  const activeScope = useRef(key);
  const collecting = useRef(false);
  const lastTrackedSession = useRef("");
  activeScope.current = key;
  collecting.current = enabled && preferenceScope === key && preference === "accepted";
  useEffect(() => {
    queue.current = [];
    identity.current = undefined;
    viewed.current = "";
    try {
      setPreference(
        (localStorage.getItem(`${key}:preference`) as "accepted" | "declined") || "unknown",
      );
    } catch {
      setPreference("unknown");
    }
    setPreferenceScope(key);
  }, [key]);
  const choose = useCallback(
    (value: "accepted" | "declined") => {
      setPreference(value);
      try {
        localStorage.setItem(`${key}:preference`, value);
        if (value === "declined") localStorage.removeItem(key);
      } catch {
        /* in-memory preference */
      }
      if (value === "declined") {
        collecting.current = false;
        identity.current = undefined;
        queue.current = [];
        viewed.current = "";
      }
    },
    [key],
  );
  const getIdentity = useCallback(() => {
    if (!enabled || !pageId || preference !== "accepted" || preferenceScope !== key) return;
    let current = identity.current;
    if (!current) {
      try {
        current = JSON.parse(localStorage.getItem(key) ?? "null") as Identity;
      } catch {
        /* memory only */
      }
    }
    const now = Date.now();
    if (!current || current.expiresAt < now || !current.visitorId || !current.sessionId)
      current = {
        visitorId: random(),
        sessionId: random(),
        lastActivity: now,
        expiresAt: now + 90 * 86400000,
      };
    if (now - current.lastActivity > 1800000) current.sessionId = random();
    current.lastActivity = now;
    identity.current = current;
    try {
      localStorage.setItem(key, JSON.stringify(current));
    } catch {
      /* memory only */
    }
    return current;
  }, [enabled, key, pageId, preference, preferenceScope]);
  const flush = useCallback(async () => {
    const scope = key;
    const batch = queue.current
      .splice(0, 20)
      .filter((event) => Date.now() - Date.parse(event.occurredAt) < 86400000);
    if (!batch.length) return;
    try {
      await api(`/public/landing-pages/${encodeURIComponent(slug)}/events`, {
        method: "POST",
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      if (collecting.current && activeScope.current === scope)
        queue.current = [...batch, ...queue.current].slice(0, 40);
    }
  }, [key, slug]);
  const track = useCallback(
    (type: "page_view" | "cta_click" | "checkout_started", componentId?: string) => {
      const ids = getIdentity();
      if (!ids) return;
      if (type === "checkout_started") {
        if (checkout.current.has(ids.sessionId)) return;
        checkout.current.add(ids.sessionId);
      }
      let referrerHost: string | undefined;
      try {
        referrerHost = document.referrer ? new URL(document.referrer).hostname : undefined;
      } catch {
        /* unknown */
      }
      const event = {
        eventId: random(),
        visitorId: ids.visitorId,
        sessionId: ids.sessionId,
        type,
        occurredAt: new Date().toISOString(),
        componentId,
        referrerHost,
        deviceCategory: /iPad|Tablet/i.test(navigator.userAgent)
          ? "tablet"
          : /Mobi|Android/i.test(navigator.userAgent)
            ? "mobile"
            : "desktop",
      };
      const sessionView =
        type !== "page_view" && lastTrackedSession.current !== ids.sessionId
          ? [{ ...event, eventId: random(), type: "page_view", componentId: undefined }]
          : [];
      lastTrackedSession.current = ids.sessionId;
      queue.current = [...queue.current, ...sessionView, event].slice(-40);
      void flush();
    },
    [flush, getIdentity],
  );
  useEffect(() => {
    if (
      !enabled ||
      !pageId ||
      preference !== "accepted" ||
      preferenceScope !== key ||
      viewed.current === key
    )
      return;
    viewed.current = key;
    track("page_view");
  }, [enabled, key, pageId, preference, preferenceScope, track]);
  useEffect(() => {
    if (preference !== "accepted" || !enabled) return;
    const click = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest("a,button") : null;
      const block = element?.closest<HTMLElement>("[data-block-id]");
      if (block?.dataset.blockId) track("cta_click", block.dataset.blockId);
    };
    document.addEventListener("click", click);
    const timer = setInterval(() => void flush(), 15000);
    const leave = () => {
      void flush();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", leave);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", click);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("online", leave);
    };
  }, [enabled, flush, preference, track]);
  return {
    preference: preferenceScope === key ? preference : "unknown",
    choose,
    track,
    sessionId: () => getIdentity()?.sessionId,
  };
}
