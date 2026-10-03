import { restoreAccessToken, tokenStore } from "@/api/client";

export type LibraryImage = {
  id: string;
  imageUrl: string;
  mime: string;
  width: number;
  height: number;
  byteLength: number;
  createdAt: string;
  trashedAt?: string;
};
export type LibraryPage = { items: LibraryImage[]; nextCursor: string | null };

export function validateImageFile(file: File) {
  if (file.size > 20 * 1024 * 1024) return "Choose an image smaller than 20 MB.";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type))
    return "Choose a JPEG, PNG, WebP or AVIF image.";
  return "";
}

export async function openImageCopy(image: LibraryImage, signal: AbortSignal) {
  const request = () =>
    fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/images/${image.id}`, {
      signal,
      credentials: "include",
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
    });
  let response = await request();
  if (response.status === 401 && (await restoreAccessToken())) response = await request();
  if (!response.ok) throw new Error("Could not open this image for editing.");
  const blob = await response.blob();
  signal.throwIfAborted();
  return new File([blob], `image-${image.id}.${image.mime.split("/")[1] ?? "png"}`, {
    type: blob.type,
  });
}
