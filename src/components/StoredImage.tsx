import { type ImgHTMLAttributes, useEffect, useState } from "react";
import { restoreAccessToken, tokenStore } from "@/api/client";
export const isStoredImage = (url?: string) => /^\/api\/images\/[a-f0-9]{24}$/.test(url ?? "");
export function StoredImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (!src || !isStoredImage(src)) return;
    const control = new AbortController();
    let objectUrl = "";
    setLocal("");
    const base = import.meta.env.VITE_API_URL ?? "/api";
    const path = src.replace("/api", "");
    const load = async () => {
      let response = await fetch(`${base}/public${path}`, { signal: control.signal });
      if (!response.ok && tokenStore.get()) {
        const privateFetch = () =>
          fetch(`${base}${path}`, {
            signal: control.signal,
            headers: { Authorization: `Bearer ${tokenStore.get()}` },
          });
        response = await privateFetch();
        if (response.status === 401 && (await restoreAccessToken()))
          response = await privateFetch();
      }
      if (!response.ok) return;
      const blob = await response.blob();
      if (control.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLocal(objectUrl);
    };
    void load().catch(() => {});
    return () => {
      control.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return <img {...props} alt={alt} src={isStoredImage(src) ? local || undefined : src} />;
}
