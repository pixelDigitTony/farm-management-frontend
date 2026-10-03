import { useEffect, useRef, useState } from "react";
import { MediaPicker } from "@/components/MediaPicker";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { useImageUpload } from "@/hooks/useImageUpload";
import { getMenuMediaEmbed } from "@/lib/google-drive";

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
  const { busy, status, setStatus, upload: uploadFile, cancel } = useImageUpload(scope);
  const [preview, setPreview] = useState("");
  const [preserve, setPreserve] = useState(false);
  const [picker, setPicker] = useState(false);
  const fileRef = useRef<File | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const completedSelection = useRef(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    void selection;
    cancel();
    if (completedSelection.current) {
      completedSelection.current = false;
      return cancel;
    }
    setStatus("");
    return cancel;
  }, [selection, cancel, setStatus]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form || (!busy && !picker)) return;
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus("Finish choosing your image, or close the image picker before saving.");
    };
    form.addEventListener("submit", stop, true);
    return () => form.removeEventListener("submit", stop, true);
  }, [busy, picker, setStatus]);
  async function upload(file: File, libraryOnly = false): Promise<boolean> {
    fileRef.current = file;
    setPreview(URL.createObjectURL(file));
    const imageUrl = await uploadFile(file, preserve ? "preserve" : profile);
    if (!imageUrl) return false;
    if (!libraryOnly) {
      completedSelection.current = true;
      ready.current(imageUrl);
      setPicker(false);
      setStatus("Ready — save your changes to use this image");
    } else setStatus("Image saved to your company’s media library.");
    return true;
  }
  return (
    <div ref={root} className="mb-4 space-y-3 rounded-xl border border-pink-200 bg-pink-50/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={disabled}
          className="h-11 w-full cursor-pointer sm:w-auto"
          onClick={() => {
            setStatus("");
            setPicker(true);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4m-4 4 4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          Upload a photo
        </Button>
        <span className="min-w-0 text-xs text-stone-600 break-all">
          {fileRef.current?.name || "Upload a new image or choose from your company’s library"}
        </span>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={preserve}
          disabled={busy}
          onChange={(e) => setPreserve(e.target.checked)}
        />
        Preserve detail during upload (skip automatic resizing)
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
      {busy && !picker ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            cancel();
            setStatus("Upload cancelled");
          }}
        >
          Cancel upload
        </Button>
      ) : null}
      {picker && (
        <MediaPicker
          scope={scope}
          busy={busy}
          status={status}
          onClose={() => {
            cancel();
            setPicker(false);
            if (busy) setStatus("Upload cancelled");
          }}
          onChoose={(url) => {
            if (disabled) return;
            completedSelection.current = true;
            ready.current(url);
            setPicker(false);
            setStatus("Image selected — save your changes to use it.");
          }}
          onUpload={(file, libraryOnly) =>
            disabled ? Promise.resolve(false) : upload(file, libraryOnly)
          }
        />
      )}
    </div>
  );
}
