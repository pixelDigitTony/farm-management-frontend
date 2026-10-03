import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";

export type ImageScope = "catalog" | "menu" | "landing-page" | "media-library";
type Status = {
  jobId: string;
  state: "queued" | "processing" | "ready" | "failed";
  imageUrl?: string;
  error?: string;
};

// Shared upload, polling, cancellation and cleanup for page and form image editors.
export function useImageUpload(scope: ImageScope) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  const job = useRef<string | null>(null);
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (job.current) void api(`/images/jobs/${job.current}`, { method: "DELETE" }).catch(() => {});
    job.current = null;
    setBusy(false);
  }, []);
  useEffect(() => cancel, [cancel]);

  async function upload(file: File, profile = "photo", sourceImageId?: string) {
    cancel();
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setStatus("Uploading");
    try {
      const started = await api<Status>(
        `/images/jobs?scope=${scope}&profile=${profile}${sourceImageId ? `&sourceImageId=${sourceImageId}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
          signal: control.signal,
        },
      );
      if (control.signal.aborted) return null;
      job.current = started.jobId;
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = await api<Status>(`/images/jobs/${started.jobId}`, {
          signal: control.signal,
        });
        if (control.signal.aborted) return null;
        setStatus(
          current.state === "queued"
            ? "Queued"
            : current.state === "processing"
              ? "Processing"
              : current.state === "ready"
                ? "Ready"
                : (current.error ?? "Upload failed"),
        );
        if (current.state === "failed") {
          job.current = null;
          return null;
        }
        if (current.state === "ready" && current.imageUrl) {
          job.current = null;
          return current.imageUrl;
        }
        if (attempt === 59)
          throw new Error("Processing is taking too long. Cancel or retry later.");
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timer = setTimeout(
            () => {
              control.signal.removeEventListener("abort", abort);
              resolve();
            },
            Math.min(1000 * 1.4 ** attempt, 10_000),
          );
          control.signal.addEventListener("abort", abort, { once: true });
        });
      }
    } catch (error) {
      if (!control.signal.aborted)
        setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      if (!control.signal.aborted) {
        setBusy(false);
        // A timed-out/error job must not be left processing after this editor closes.
        if (job.current)
          void api(`/images/jobs/${job.current}`, { method: "DELETE" }).catch(() => {});
        job.current = null;
      }
    }
    return null;
  }
  return { busy, status, setStatus, upload, cancel };
}
