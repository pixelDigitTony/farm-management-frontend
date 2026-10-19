import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { getPublicSiteUrl } from "@/lib/public-site";

export function SubdomainField({
  value,
  onChange,
  pageId,
  onReady,
}: {
  value: string;
  onChange: (value: string) => void;
  pageId?: string;
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    ready.current(false);
    const slug = value.trim().toLowerCase();
    if (!slug) {
      setStatus("Enter a subdomain");
      return;
    }
    if (slug.length < 3 || slug.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setStatus("Use 3–60 lowercase letters, numbers, and hyphens between words");
      return;
    }
    const controller = new AbortController();
    setStatus("Checking availability…");
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ status: string }>(
          `/landing-page/subdomains/availability?slug=${encodeURIComponent(slug)}${pageId ? `&pageId=${encodeURIComponent(pageId)}` : ""}&retry=${retry}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const allowed = result.status === "AVAILABLE" || result.status === "CURRENT_PAGE";
        setStatus(
          result.status === "AVAILABLE"
            ? "Available"
            : result.status === "CURRENT_PAGE"
              ? "This page already uses this address"
              : result.status === "RESERVED"
                ? "This subdomain is reserved"
                : "This subdomain is already taken",
        );
        ready.current(allowed);
      } catch {
        if (!controller.signal.aborted) setStatus("Could not check availability. Retry.");
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, pageId, retry]);
  return (
    <div className="space-y-2">
      <label className="lb-field">
        <span>Subdomain</span>
        <input
          aria-label="Subdomain"
          name="slug"
          value={value}
          minLength={3}
          maxLength={60}
          required
          onChange={(e) => {
            ready.current(false);
            onChange(e.target.value.toLowerCase().trim());
          }}
        />
      </label>
      <p className="break-all text-xs text-stone-500">
        {getPublicSiteUrl(value.trim().toLowerCase() || "your-page")}
      </p>
      <p role="status" aria-live="polite" className="text-sm">
        {status}
        {status.startsWith("Could not") && (
          <button
            type="button"
            className="lb-text-button ml-2"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        )}
      </p>
    </div>
  );
}
