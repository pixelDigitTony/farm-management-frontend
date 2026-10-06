import { useCallback, useEffect, useRef, useState } from "react";

// Keep requests in order and retain the newest edit while an older save is in flight.
export function useDraftAutosave<T>(persist: (draft: T) => Promise<unknown>) {
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const pending = useRef<{ draft: T } | undefined>(undefined);
  const active = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (active.current) return active.current;
    if (!pending.current) return Promise.resolve(true);
    setStatus("saving");
    active.current = (async () => {
      while (pending.current) {
        const editing = pending.current;
        pending.current = undefined;
        try {
          await persistRef.current(editing.draft);
        } catch (cause) {
          // A newer edit may fix an incomplete field that failed validation.
          if (pending.current) continue;
          pending.current = editing;
          setError(cause instanceof Error ? cause.message : "Could not save draft");
          setStatus("error");
          return false;
        }
      }
      setError("");
      setStatus("saved");
      return true;
    })().finally(() => {
      active.current = undefined;
    });
    return active.current;
  }, []);

  const schedule = useCallback(
    (draft: T) => {
      pending.current = { draft: structuredClone(draft) };
      setError("");
      setStatus(active.current ? "saving" : "pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  const discard = useCallback(async () => {
    clearTimeout(timer.current);
    pending.current = undefined;
    await active.current;
    // A failed in-flight save can restore its pending draft; reset supersedes it.
    pending.current = undefined;
    setError("");
    setStatus("saved");
  }, []);

  useEffect(() => {
    const onPageHide = () => void flush();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current && !active.current) return;
      void flush();
      event.preventDefault();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, discard, status, error };
}
