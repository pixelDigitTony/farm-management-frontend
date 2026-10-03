import { Icon } from "@iconify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, sessionUserStore } from "@/api/client";
import { ImageEditor } from "@/components/ImageEditor";
import { Header } from "@/components/PageHeader";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useImageUpload } from "@/hooks/useImageUpload";
import {
  type LibraryImage,
  type LibraryPage,
  openImageCopy,
  validateImageFile,
} from "@/lib/media-library";
import { canAccess } from "@/lib/permissions";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
const imageLabel = (image: LibraryImage) => `Image ${image.id.slice(-6)}`;

export function MediaLibraryPage() {
  const user = sessionUserStore.get();
  const canView = canAccess(user, "media-library");
  const canUpload = canAccess(user, "media-library", "create");
  const canEdit = canUpload && canAccess(user, "media-library", "edit");
  const canRemove = canAccess(user, "media-library", "delete");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"active" | "trash">("active");
  const [before, setBefore] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<LibraryImage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [preserve, setPreserve] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState<LibraryImage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const copyRequest = useRef<AbortController | null>(null);
  const upload = useImageUpload("media-library");
  const library = useQuery({
    queryKey: ["media-library", user?.id, tab, before],
    queryFn: ({ signal }) =>
      api<LibraryPage>(
        `/images/library?scope=media-library&status=${tab}&limit=24${before ? `&before=${before}` : ""}`,
        { signal },
      ),
    enabled: canView,
  });
  useEffect(() => () => copyRequest.current?.abort(), []);

  function closeEditor() {
    upload.cancel();
    setFile(null);
    setSourceId(undefined);
  }
  function switchTab(value: "active" | "trash") {
    setTab(value);
    setBefore(null);
    setHistory([]);
    setSelected(null);
    setError("");
    setNotice("");
  }
  async function refreshLibrary() {
    setBefore(null);
    setHistory([]);
    await queryClient.invalidateQueries({ queryKey: ["media-library", user?.id] });
  }
  async function editCopy(image: LibraryImage) {
    if (!canEdit || image.trashedAt) return;
    copyRequest.current?.abort();
    const controller = new AbortController();
    copyRequest.current = controller;
    setPending(true);
    setError("");
    try {
      const copy = await openImageCopy(image, controller.signal);
      if (controller.signal.aborted) return;
      setSourceId(image.id);
      setFile(copy);
      setSelected(null);
      setPreserve(false);
      upload.setStatus("");
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Could not open image.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  async function move(image: LibraryImage, operation: "trash" | "restore") {
    if (!canRemove) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api(`/images/${image.id}/${operation}`, { method: "POST" });
      setConfirmTrash(null);
      setSelected(null);
      setNotice(
        operation === "trash"
          ? "Photo moved to trash. Existing uses remain visible."
          : "Photo restored to the library.",
      );
      await refreshLibrary();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update image.");
    } finally {
      setPending(false);
    }
  }
  if (!canView) return <p role="alert">Your role does not have access to Media library.</p>;
  return (
    <div className="space-y-6 pb-6">
      <Header
        title="Media library"
        description="Manage your company’s photos and reuse them across products, menus and your website."
      >
        {canUpload && (
          <Button
            type="button"
            className="h-11 w-full cursor-pointer sm:w-auto"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <Icon icon="solar:upload-linear" className="size-5" /> Upload photo
          </Button>
        )}
      </Header>
      <input
        ref={input}
        type="file"
        className="hidden"
        aria-label="Choose library photo"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen || !canUpload) return;
          const validation = validateImageFile(chosen);
          setError(validation);
          setNotice("");
          if (validation) return;
          setSourceId(undefined);
          setPreserve(false);
          upload.setStatus("");
          setFile(chosen);
        }}
      />
      <div className="rounded-2xl border border-pink-100 bg-white p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-4">
          <fieldset className="flex gap-2" aria-label="Library view">
            <Button
              type="button"
              variant={tab === "active" ? "default" : "outline"}
              aria-pressed={tab === "active"}
              disabled={pending}
              onClick={() => switchTab("active")}
            >
              Library
            </Button>
            <Button
              type="button"
              variant={tab === "trash" ? "default" : "outline"}
              aria-pressed={tab === "trash"}
              disabled={pending}
              onClick={() => switchTab("trash")}
            >
              <Icon icon="solar:trash-bin-trash-linear" className="size-4" /> Trash
            </Button>
          </fieldset>
          <p className="text-xs text-stone-500">
            {tab === "active"
              ? "Company images from all pages"
              : "Trashed photos keep existing uses working and retain storage."}
          </p>
        </div>
        {notice && (
          <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {library.isPending ? (
          <p role="status" className="py-12 text-center text-sm text-stone-500">
            Loading your library…
          </p>
        ) : library.isError ? (
          <div role="alert" className="space-y-3 py-8 text-center">
            <p className="text-sm text-red-700">{library.error.message}</p>
            <Button type="button" variant="outline" onClick={() => void library.refetch()}>
              Retry loading
            </Button>
          </div>
        ) : !library.data?.items.length ? (
          <div className="rounded-xl bg-stone-50 px-4 py-12 text-center">
            <Icon icon="solar:gallery-linear" className="mx-auto mb-3 size-10 text-pink-400" />
            <h3 className="font-semibold">
              {tab === "active" ? "No photos in your library" : "Trash is empty"}
            </h3>
            <p className="mt-2 text-sm text-stone-500">
              {tab === "active"
                ? "Upload a photo to start building your company’s collection."
                : "Photos you move to trash will appear here."}
            </p>
            {tab === "active" && canUpload && (
              <Button type="button" className="mt-5" onClick={() => input.current?.click()}>
                Upload your first photo
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {library.data.items.map((image) => (
              <article
                key={image.id}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white"
              >
                <button
                  type="button"
                  aria-label={`Preview ${imageLabel(image)}`}
                  className="block w-full cursor-pointer p-2 focus-visible:outline-2 focus-visible:outline-pink-700"
                  onClick={() => {
                    setError("");
                    setSelected(image);
                  }}
                >
                  <StoredImage
                    src={image.imageUrl}
                    alt={imageLabel(image)}
                    className="aspect-square w-full rounded-lg bg-stone-100 object-contain"
                  />
                </button>
                <div className="space-y-3 px-3 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold">{imageLabel(image)}</h3>
                    <p className="mt-1 text-xs text-stone-500">
                      {image.width} × {image.height} px · {sizeLabel(image.byteLength)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Uploaded {new Date(image.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tab === "active" && canEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => void editCopy(image)}
                      >
                        Edit a copy
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          tab === "active" ? setConfirmTrash(image) : void move(image, "restore")
                        }
                      >
                        {tab === "active" ? "Move to trash" : "Restore"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-between gap-3 border-t border-pink-100 pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || library.isFetching || !history.length}
            onClick={() => {
              setBefore(history[history.length - 1] ?? null);
              setHistory((values) => values.slice(0, -1));
            }}
          >
            Newer images
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || library.isFetching || library.isError || !library.data?.nextCursor}
            onClick={() => {
              setHistory((values) => [...values, before]);
              setBefore(library.data?.nextCursor ?? null);
            }}
          >
            Older images
          </Button>
        </div>
      </div>
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogTitle>{imageLabel(selected)}</DialogTitle>
            <DialogDescription>
              {selected.width} × {selected.height} px · {sizeLabel(selected.byteLength)} · Uploaded{" "}
              {new Date(selected.createdAt).toLocaleDateString()}
            </DialogDescription>
            <StoredImage
              src={selected.imageUrl}
              alt="Library photo preview"
              className="my-5 max-h-[55vh] w-full rounded-xl bg-stone-100 object-contain"
            />
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {tab === "active" && canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void editCopy(selected)}
                >
                  {pending ? "Opening…" : "Edit a copy"}
                </Button>
              )}
              {canRemove && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (tab === "active") {
                      setConfirmTrash(selected);
                      setSelected(null);
                    } else void move(selected, "restore");
                  }}
                >
                  {tab === "active" ? "Move to trash" : "Restore"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {confirmTrash && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setConfirmTrash(null);
          }}
        >
          <DialogContent>
            <DialogTitle>Move photo to trash?</DialogTitle>
            <DialogDescription>
              This hides the photo from the library and image pickers. Existing products, menus,
              pages and orders keep using it. You can restore it later; storage is retained.
            </DialogDescription>
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmTrash(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => void move(confirmTrash, "trash")}
              >
                {pending ? "Moving…" : "Move to trash"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {file && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
        >
          <DialogContent className="max-w-4xl p-4 sm:p-6">
            <DialogTitle>{sourceId ? "Edit a copy" : "Upload photo"}</DialogTitle>
            <DialogDescription>
              Adjust your photo, then confirm the final preview to save it to your company’s
              library.
            </DialogDescription>
            <label className="mb-4 mt-5 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={preserve}
                disabled={upload.busy}
                onChange={(event) => setPreserve(event.target.checked)}
              />{" "}
              Preserve detail during upload (skip automatic resizing)
            </label>
            <ImageEditor
              file={file}
              busy={upload.busy}
              status={upload.status}
              libraryOnlyInitial
              libraryOnlyLocked
              onBack={closeEditor}
              onCancel={closeEditor}
              onUpload={async (prepared) => {
                const imageUrl = await upload.upload(
                  prepared,
                  preserve ? "preserve" : "photo",
                  sourceId,
                );
                if (!imageUrl) return;
                closeEditor();
                setTab("active");
                setNotice("Photo saved to your company’s media library.");
                await refreshLibrary();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
