import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageUpload } from "@/components/ImageUpload";
import { getMenuMediaEmbed } from "@/lib/google-drive";

const mocked = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ ...mocked, sessionUserStore: { get: () => null } }));
beforeEach(() => {
  mocked.api.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
const file = () => new File(["content"], "photo.png", { type: "image/png" });
it("attaches only a ready image and preserves original binary upload", async () => {
  mocked.api.mockResolvedValueOnce({ jobId: "one", state: "queued" }).mockResolvedValueOnce({
    jobId: "one",
    state: "ready",
    imageUrl: "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const onReady = vi.fn();
  render(<ImageUpload scope="catalog" selection="https://old.test/a.jpg" onReady={onReady} />);
  const selected = file();
  fireEvent.change(screen.getByLabelText("Upload a photo"), { target: { files: [selected] } });
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
  fireEvent.change(screen.getByLabelText("Upload a photo"), { target: { files: [file()] } });
  fireEvent.submit(screen.getByRole("form"));
  expect(saved).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  finish?.({ jobId: "one", state: "queued" });
  await screen.findByText("Quality rejected");
  expect(onReady).not.toHaveBeenCalled();
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
  fireEvent.change(screen.getByLabelText("Upload a photo"), { target: { files: [file()] } });
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
