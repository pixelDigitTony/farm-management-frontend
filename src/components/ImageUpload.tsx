import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { getMenuMediaEmbed } from "@/lib/google-drive";

type Status = {
  jobId: string;
  state: "queued" | "processing" | "ready" | "failed";
  imageUrl?: string;
  error?: string;
};
export function ImageUpload({
  scope,
  profile = "photo",
  selection,
  onReady,
  disabled = false,
}: {
  scope: "catalog" | "menu" | "landing-page";
  profile?: "photo" | "display" | "avatar";
  selection: string;
  onReady: (url: string) => void;
  disabled?: boolean;
}) {
  const savedImage = useRef(
    selection
      .split("\n")
      .map((value) => value.trim())
      .find((value) => {
        const media = getMenuMediaEmbed(value);
        return media?.provider === "Uploaded image" || (/^https:\/\//.test(value) && !media);
      }),
  );
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [preserve, setPreserve] = useState(false);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const job = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const completedSelection = useRef(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (job.current) void api(`/images/jobs/${job.current}`, { method: "DELETE" }).catch(() => {});
    job.current = null;
  }, []);
  useEffect(() => {
    void selection;
    cancel();
    setBusy(false);
    if (completedSelection.current) {
      completedSelection.current = false;
      return cancel;
    }
    setStatus("");
    return cancel;
  }, [selection, cancel]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form || !busy) return;
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus("Wait for the photo to finish, or cancel the upload before saving.");
    };
    form.addEventListener("submit", stop, true);
    return () => form.removeEventListener("submit", stop, true);
  }, [busy]);
  async function upload(file: File) {
    cancel();
    const control = new AbortController();
    controller.current = control;
    fileRef.current = file;
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setStatus("Uploading");
    try {
      const started = await api<Status>(
        `/images/jobs?scope=${scope}&profile=${preserve ? "preserve" : profile}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
          signal: control.signal,
        },
      );
      if (control.signal.aborted) return;
      job.current = started.jobId;
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = await api<Status>(`/images/jobs/${started.jobId}`, {
          signal: control.signal,
        });
        if (control.signal.aborted) return;
        setStatus(
          current.state === "queued"
            ? "Queued"
            : current.state === "processing"
              ? "Processing"
              : current.state === "ready"
                ? "Ready — save your changes to use this image"
                : (current.error ?? "Upload failed"),
        );
        if (current.state === "failed") {
          job.current = null;
          break;
        }
        if (current.state === "ready" && current.imageUrl) {
          job.current = null;
          completedSelection.current = true;
          ready.current(current.imageUrl);
          break;
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
      if (!control.signal.aborted) setBusy(false);
    }
  }
  return (
    <div ref={root} className="space-y-3 rounded-xl border border-pink-200 bg-pink-50/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={disabled}
          className="h-11 w-full cursor-pointer sm:w-auto"
          onClick={() => inputRef.current?.click()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4m-4 4 4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          Upload a photo
        </Button>
        <span className="min-w-0 text-xs text-stone-600 break-all">
          {fileRef.current?.name || "Choose an image from your device"}
        </span>
        <input
          ref={inputRef}
          className="hidden"
          aria-label="Upload a photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={preserve}
          disabled={busy}
          onChange={(e) => setPreserve(e.target.checked)}
        />
        Preserve exact detail (text, labels or diagrams; no resizing)
      </label>
      {savedImage.current && (
        <div className="space-y-1">
          <p className="text-xs text-stone-500">Saved image</p>
          <StoredImage
            src={savedImage.current}
            alt="Currently saved"
            className="h-24 w-32 rounded-lg object-contain"
          />
        </div>
      )}
      {preview && (
        <img
          src={preview}
          alt="Selected upload preview"
          className="h-24 w-32 rounded-lg object-contain"
        />
      )}
      <p role="status" aria-live="polite" className="text-xs text-stone-600">
        {status || "JPEG, PNG, WebP or AVIF. Your saved image stays in place until you save."}
      </p>
      {busy ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            cancel();
            setBusy(false);
            setStatus("Upload cancelled");
          }}
        >
          Cancel upload
        </Button>
      ) : (
        fileRef.current && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              if (fileRef.current) void upload(fileRef.current);
            }}
          >
            Retry upload
          </Button>
        )
      )}
    </div>
  );
}
