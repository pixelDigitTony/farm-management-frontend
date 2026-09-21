import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageUpload } from "@/components/ImageUpload";
import { getMenuMediaEmbed } from "@/lib/google-drive";

const mocked = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ ...mocked, sessionUserStore: { get: () => null } }));
vi.mock("@/components/StoredImage", () => ({
  StoredImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
// Canvas editing is exercised by the browser verification; these tests cover upload lifecycle.
vi.mock("@/components/ImageEditor", () => ({
  ImageEditor: ({
    file,
    onUpload,
  }: {
    file: File;
    onUpload: (file: File, libraryOnly: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onUpload(file, false)}>
        Upload & use image
      </button>
      <button type="button" onClick={() => onUpload(file, true)}>
        Upload to library
      </button>
    </>
  ),
}));
beforeEach(() => {
  mocked.api.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
const file = () => new File(["content"], "photo.png", { type: "image/png" });
it("saves library-only uploads without attaching them to the form", async () => {
  mocked.api
    .mockResolvedValueOnce({ jobId: "one", state: "queued" })
    .mockResolvedValueOnce({ state: "ready", imageUrl: "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa" })
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  const onReady = vi.fn();
  render(<ImageUpload scope="catalog" selection="" onReady={onReady} />);
  fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
  fireEvent.change(screen.getByLabelText("Choose image file"), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload to library" }));
  await screen.findByText("Image added to your company’s media library.");
  expect(onReady).not.toHaveBeenCalled();
});
it("reuses a library image without creating another upload job", async () => {
  const imageUrl = "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa";
  mocked.api.mockResolvedValue({
    items: [
      {
        id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        imageUrl,
        mime: "image/png",
        width: 40,
        height: 30,
        byteLength: 200,
        createdAt: "2026-09-21",
      },
    ],
    nextCursor: null,
  });
  const onReady = vi.fn();
  render(<ImageUpload scope="landing-page" selection="" onReady={onReady} />);
  fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Media library" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select image aaaaaa" }));
  fireEvent.click(screen.getByRole("button", { name: "Use selected image" }));
  expect(onReady).toHaveBeenCalledWith(imageUrl);
  expect(mocked.api.mock.calls.every(([path]) => path.startsWith("/images/library?"))).toBe(true);
});
function chooseFile(selected: File) {
  fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
  fireEvent.change(screen.getByLabelText("Choose image file"), { target: { files: [selected] } });
  expect(mocked.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Upload & use image" }));
}
it("attaches only a ready image and preserves original binary upload", async () => {
  mocked.api.mockResolvedValueOnce({ jobId: "one", state: "queued" }).mockResolvedValueOnce({
    jobId: "one",
    state: "ready",
    imageUrl: "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const onReady = vi.fn();
  render(<ImageUpload scope="catalog" selection="https://old.test/a.jpg" onReady={onReady} />);
  const selected = file();
  chooseFile(selected);
  await waitFor(() => expect(onReady).toHaveBeenCalledWith("/api/images/aaaaaaaaaaaaaaaaaaaaaaaa"));
  expect(mocked.api.mock.calls[0]?.[1].body).toBe(selected);
});
it("blocks save during processing and leaves the old image on failure", async () => {
  let finish: ((value: unknown) => void) | undefined;
  mocked.api
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ state: "failed", error: "Quality rejected" });
  const saved = vi.fn();
  const onReady = vi.fn();
  render(
    <form
      aria-label="Edit product"
      onSubmit={(event) => {
        event.preventDefault();
        saved();
      }}
    >
      <ImageUpload scope="catalog" selection="https://old.test/a.jpg" onReady={onReady} />
      <button type="submit">Save</button>
    </form>,
  );
  chooseFile(file());
  fireEvent.submit(screen.getByRole("form", { hidden: true }));
  expect(saved).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  finish?.({ jobId: "one", state: "queued" });
  await screen.findByText("Quality rejected");
  expect(onReady).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.submit(screen.getByRole("form"));
  expect(saved).toHaveBeenCalledOnce();
});
it("ignores completion after a newer selection and stops work on unmount", async () => {
  let finish: ((value: unknown) => void) | undefined;
  mocked.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onReady = vi.fn();
  const { rerender, unmount } = render(
    <ImageUpload scope="menu" selection="old" onReady={onReady} />,
  );
  chooseFile(file());
  const signal = mocked.api.mock.calls[0]?.[1].signal;
  rerender(<ImageUpload scope="menu" selection="newer" onReady={onReady} />);
  expect(signal.aborted).toBe(true);
  finish?.({ jobId: "old", state: "ready", imageUrl: "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa" });
  await waitFor(() => expect(onReady).not.toHaveBeenCalled());
  unmount();
});
it("continues to recognize Drive and video embeds alongside uploaded references", () => {
  expect(getMenuMediaEmbed("https://drive.google.com/file/d/abc123/view")?.provider).toBe(
    "Google Drive",
  );
  expect(getMenuMediaEmbed("https://youtu.be/dQw4w9WgXcQ")?.provider).toBe("YouTube");
  expect(getMenuMediaEmbed("/api/images/aaaaaaaaaaaaaaaaaaaaaaaa")?.provider).toBe(
    "Uploaded image",
  );
});
