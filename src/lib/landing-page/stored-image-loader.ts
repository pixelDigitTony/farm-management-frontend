import { restoreAccessToken, tokenStore } from "@/api/client";

// Share only in-flight work, and only among consumers with the same auth snapshot.
// Each consumer owns its own object URL; no private image survives in a shared cache.
const pending = new Map<
  string,
  { controller: AbortController; users: number; promise: Promise<Blob> }
>();

export function acquireStoredImage(src: string) {
  const token = tokenStore.get();
  const key = JSON.stringify([src, token]);
  let request = pending.get(key);
  if (!request) {
    const controller = new AbortController();
    const base = import.meta.env.VITE_API_URL ?? "/api";
    const path = src.replace("/api", "");
    const load = async () => {
      let privateToken: string | null = null;
      let response = await fetch(`${base}/public${path}`, { signal: controller.signal });
      if (!response.ok && token && tokenStore.get() === token && !controller.signal.aborted) {
        privateToken = token;
        response = await fetch(`${base}${path}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401 && tokenStore.get() === token && !controller.signal.aborted) {
          const refreshed = await restoreAccessToken();
          if (refreshed && tokenStore.get() === refreshed && !controller.signal.aborted) {
            privateToken = refreshed;
            response = await fetch(`${base}${path}`, {
              signal: controller.signal,
              headers: { Authorization: `Bearer ${refreshed}` },
            });
          }
        }
      }
      if (!response.ok) throw new Error(`Image request failed (${response.status})`);
      const blob = await response.blob();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (privateToken && tokenStore.get() !== privateToken)
        throw new Error("Image session changed");
      return blob;
    };
    const entry = { controller, users: 0, promise: Promise.resolve(new Blob()) };
    entry.promise = load().finally(() => {
      if (pending.get(key) === entry) pending.delete(key);
    });
    request = entry;
    pending.set(key, entry);
  }
  const entry = request;
  entry.users++;
  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      if (--entry.users === 0 && pending.get(key) === entry) {
        pending.delete(key);
        entry.controller.abort();
      }
    },
  };
}
