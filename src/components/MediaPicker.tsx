import { useEffect, useRef, useState } from "react";
import { api, restoreAccessToken, tokenStore } from "@/api/client";
import { ImageEditor } from "@/components/ImageEditor";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type LibraryImage = {
  id: string;
  imageUrl: string;
  mime: string;
  width: number;
  height: number;
  byteLength: number;
  createdAt: string;
};
type LibraryPage = { items: LibraryImage[]; nextCursor: string | null };
export function MediaPicker({
  scope,
  busy,
  status,
  onClose,
  onChoose,
  onUpload,
}: {
  scope: "catalog" | "menu" | "landing-page";
  busy: boolean;
  status: string;
  onClose: () => void;
  onChoose: (url: string) => void;
  onUpload: (file: File, libraryOnly: boolean) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"upload" | "library">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
  const [items, setItems] = useState<LibraryImage[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingCopy, setEditingCopy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copyRequest = useRef<AbortController | null>(null);
  useEffect(() => () => copyRequest.current?.abort(), []);
  useEffect(() => {
    void refresh;
    if (tab !== "library" || file) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    void api<LibraryPage>(
      `/images/library?scope=${scope}&limit=24${before ? `&before=${before}` : ""}`,
      { signal: controller.signal },
    )
      .then((page) => {
        if (!controller.signal.aborted) {
          setItems(page.items);
          setNext(page.nextCursor);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setItems([]);
          setNext(null);
          setError(failure instanceof Error ? failure.message : "Could not load images.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, tab, before, refresh, file]);
  const chooseFile = (onlyLibrary: boolean) => {
    setLibraryOnly(onlyLibrary);
    input.current?.click();
  };
  async function editCopy() {
    if (!selected) return;
    copyRequest.current?.abort();
    const controller = new AbortController();
    copyRequest.current = controller;
    setEditingCopy(true);
    setError("");
    setNotice("");
    try {
      const request = () =>
        fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/images/${selected.id}`, {
          signal: controller.signal,
          credentials: "include",
          headers: { Authorization: `Bearer ${tokenStore.get()}` },
        });
      let response = await request();
      if (response.status === 401 && (await restoreAccessToken())) response = await request();
      if (!response.ok) throw new Error("Could not open this image for editing.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      setLibraryOnly(false);
      setFile(
        new File([blob], `image-${selected.id}.${selected.mime.split("/")[1] ?? "png"}`, {
          type: blob.type,
        }),
      );
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Could not open image.");
    } finally {
      if (!controller.signal.aborted) setEditingCopy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl p-4 sm:p-6">
        <DialogTitle>{file ? "Edit your image" : "Choose an image"}</DialogTitle>
        <DialogDescription>
          {file
            ? "Make your adjustments, then preview before uploading."
            : "Upload a new photo or reuse an image from your company’s media library."}
        </DialogDescription>
        <input
          ref={input}
          type="file"
          className="hidden"
          aria-label="Choose image file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (!chosen) return;
            setError("");
            setNotice("");
            if (chosen.size > 20 * 1024 * 1024) {
              setError("Choose an image smaller than 20 MB.");
              return;
            }
            if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(chosen.type)) {
              setError("Choose a JPEG, PNG, WebP or AVIF image.");
              return;
            }
            setFile(chosen);
          }}
        />
        <div className="mt-5">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </p>
          )}
          {file ? (
            <ImageEditor
              file={file}
              libraryOnlyInitial={libraryOnly}
              busy={busy}
              status={status}
              onBack={() => setFile(null)}
              onCancel={onClose}
              onUpload={async (prepared, onlyLibrary) => {
                if ((await onUpload(prepared, onlyLibrary)) && onlyLibrary) {
                  setFile(null);
                  setTab("library");
                  setBefore(null);
                  setHistory([]);
                  setRefresh((value) => value + 1);
                  setNotice("Image added to your company’s media library.");
                }
              }}
            />
          ) : (
            <>
              <fieldset
                className="mb-5 flex gap-2 border-b border-pink-100 pb-3"
                aria-label="Image source"
              >
                <Button
                  type="button"
                  variant={tab === "upload" ? "default" : "outline"}
                  aria-pressed={tab === "upload"}
                  disabled={editingCopy}
                  onClick={() => setTab("upload")}
                >
                  Upload new
                </Button>
                <Button
                  type="button"
                  variant={tab === "library" ? "default" : "outline"}
                  aria-pressed={tab === "library"}
                  disabled={editingCopy}
                  onClick={() => setTab("library")}
                >
                  Media library
                </Button>
              </fieldset>
              {tab === "upload" ? (
                <div className="rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 px-5 py-10 text-center">
                  <h3 className="text-base font-semibold">Start with a photo from your device</h3>
                  <p className="mb-5 mt-2 text-sm text-stone-500">
                    Crop, rotate, resize and adjust it before uploading.
                  </p>
                  <Button
                    type="button"
                    className="h-11 cursor-pointer"
                    onClick={() => chooseFile(false)}
                  >
                    Choose file
                  </Button>
                  <p className="mt-3 text-xs text-stone-500">
                    JPEG, PNG, WebP or AVIF · Up to 20 MB
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-stone-600">Company images from all pages</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={editingCopy}
                      onClick={() => chooseFile(true)}
                    >
                      Upload to library
                    </Button>
                  </div>
                  {loading ? (
                    <p role="status" className="py-8 text-center">
                      Loading your library…
                    </p>
                  ) : error ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      Retry loading
                    </Button>
                  ) : items.length === 0 ? (
                    <p className="rounded-xl bg-stone-50 p-8 text-center text-sm text-stone-500">
                      No images yet. Upload your first company image.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={editingCopy}
                          aria-label={`Select image ${item.id.slice(-6)}`}
                          aria-pressed={selected?.id === item.id}
                          onClick={() => setSelected(item)}
                          className={`overflow-hidden rounded-xl border-2 p-2 text-left transition focus-visible:outline-2 focus-visible:outline-pink-700 ${selected?.id === item.id ? "border-pink-700 bg-pink-50" : "border-stone-200 hover:border-pink-400"}`}
                        >
                          <StoredImage
                            src={item.imageUrl}
                            alt={`Company image ${item.id.slice(-6)}`}
                            className="aspect-square w-full rounded-lg bg-stone-100 object-contain"
                          />
                          <p className="mt-2 text-xs font-medium">
                            {item.width} × {item.height}
                          </p>
                          <p className="text-xs text-stone-500">
                            {new Date(item.createdAt).toLocaleDateString()} ·{" "}
                            {Math.ceil(item.byteLength / 1024)} KB
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading || editingCopy || !history.length}
                      onClick={() => {
                        setBefore(history[history.length - 1] ?? null);
                        setHistory((values) => values.slice(0, -1));
                      }}
                    >
                      Newer images
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading || editingCopy || !next}
                      onClick={() => {
                        setHistory((values) => [...values, before]);
                        setBefore(next);
                      }}
                    >
                      Older images
                    </Button>
                  </div>
                  {selected && !loading && (
                    <div className="space-y-3 rounded-xl border border-pink-200 bg-pink-50/40 p-3">
                      <StoredImage
                        src={selected.imageUrl}
                        alt="Selected library image preview"
                        className="max-h-48 w-full object-contain"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={editingCopy}
                          onClick={() => void editCopy()}
                        >
                          {editingCopy ? "Opening…" : "Edit a copy"}
                        </Button>
                        <Button
                          type="button"
                          disabled={editingCopy}
                          onClick={() => onChoose(selected.imageUrl)}
                        >
                          Use selected image
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
