import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MediaLibraryPage } from "@/pages/MediaLibraryPage";

const mocks = vi.hoisted(() => ({ api: vi.fn(), permissions: [] as string[], openCopy: vi.fn() }));
vi.mock("@/api/client", () => ({
  api: mocks.api,
  sessionUserStore: {
    get: () => ({ id: "staff", role: 1, isHighestRole: false, permissions: mocks.permissions }),
  },
}));
vi.mock("@/lib/media-library", async (original) => ({
  ...(await original<object>()),
  openImageCopy: mocks.openCopy,
}));
vi.mock("@/components/StoredImage", () => ({
  StoredImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock("@/components/ImageEditor", () => ({
  ImageEditor: ({
    file,
    onUpload,
    onCancel,
    status,
  }: {
    file: File;
    onUpload: (file: File) => void;
    onCancel: () => void;
    status: string;
  }) => (
    <>
      <p>Final preview test editor</p>
      <p>{status}</p>
      <button type="button" onClick={() => onUpload(file)}>
        Upload to library
      </button>
      <button type="button" onClick={onCancel}>
        Cancel upload
      </button>
    </>
  ),
}));
const image = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  imageUrl: "/api/images/aaaaaaaaaaaaaaaaaaaaaaaa",
  mime: "image/png",
  width: 800,
  height: 600,
  byteLength: 1024,
  createdAt: "2026-09-21T00:00:00Z",
};
const file = () => new File(["png"], "photo.png", { type: "image/png" });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MediaLibraryPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.api.mockReset();
  mocks.openCopy.mockReset().mockResolvedValue(file());
  mocks.permissions = [
    "media-library:view",
    "media-library:create",
    "media-library:edit",
    "media-library:delete",
  ];
  mocks.api.mockImplementation(async (path: string) =>
    path.startsWith("/images/library") ? { items: [image], nextCursor: null } : null,
  );
});
it("lets a viewer preview photos without management controls", async () => {
  mocks.permissions = ["media-library:view"];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Preview Image aaaaaa" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("800 × 600 px");
  expect(screen.queryByRole("button", { name: "Upload photo" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit a copy" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Move to trash" })).not.toBeInTheDocument();
});
it("requires trash confirmation and provides restore from the trash tab", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Move to trash" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Existing products, menus, pages and orders keep using it.");
  expect(mocks.api.mock.calls.some(([path]) => path.endsWith("/trash"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Move to trash" }));
  await screen.findByText("Photo moved to trash. Existing uses remain visible.");
  fireEvent.click(screen.getByRole("button", { name: "Trash" }));
  fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith(`${image.imageUrl.replace("/api", "")}/restore`, {
      method: "POST",
    }),
  );
});
it("uploads only on confirmation, saves to the library, and passes source id for edited copies", async () => {
  mocks.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.startsWith("/images/library")) return { items: [image], nextCursor: null };
    if (options?.method === "POST") return { jobId: "new", state: "queued" };
    return { state: "ready", imageUrl: image.imageUrl };
  });
  mount();
  fireEvent.change(screen.getByLabelText("Choose library photo"), { target: { files: [file()] } });
  expect(mocks.api.mock.calls.some(([path]) => path.includes("/jobs"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Upload to library" }));
  await screen.findByText("Photo saved to your company’s media library.");
  fireEvent.click(await screen.findByRole("button", { name: "Edit a copy" }));
  fireEvent.click(await screen.findByRole("button", { name: "Upload to library" }));
  await waitFor(() =>
    expect(
      mocks.api.mock.calls.some(
        ([path]) =>
          path === `/images/jobs?scope=media-library&profile=photo&sourceImageId=${image.id}`,
      ),
    ).toBe(true),
  );
  expect(mocks.api.mock.calls.every(([path]) => path.startsWith("/images/"))).toBe(true);
});
it("recovers from list errors and paginates using the server cursor", async () => {
  mocks.api.mockRejectedValueOnce(new Error("Library unavailable"));
  mocks.api.mockResolvedValue({ items: [image], nextCursor: image.id });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry loading" }));
  await screen.findByRole("button", { name: "Preview Image aaaaaa" });
  fireEvent.click(screen.getByRole("button", { name: "Older images" }));
  await waitFor(() =>
    expect(mocks.api.mock.calls.some(([path]) => path.endsWith(`before=${image.id}`))).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Newer images" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Newer images" })).toBeDisabled());
});
it("cancels a processing upload without saving or attaching a photo", async () => {
  mocks.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.startsWith("/images/library")) return { items: [image], nextCursor: null };
    if (options?.method === "POST") return { jobId: "slow", state: "queued" };
    return { state: "processing" };
  });
  mount();
  fireEvent.change(screen.getByLabelText("Choose library photo"), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload to library" }));
  await screen.findByText("Processing");
  fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
  expect(mocks.api).toHaveBeenCalledWith("/images/jobs/slow", { method: "DELETE" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Photo saved to your company’s media library."),
  ).not.toBeInTheDocument();
});
