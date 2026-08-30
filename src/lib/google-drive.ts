const GOOGLE_DRIVE_HOST = "drive.google.com";
const GOOGLE_DRIVE_FILE_PATH = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/;

export function getGoogleDriveFileId(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== GOOGLE_DRIVE_HOST) return undefined;
    const pathId = url.pathname.match(GOOGLE_DRIVE_FILE_PATH)?.[1];
    if (pathId) return pathId;
    if (["/open", "/uc"].includes(url.pathname)) {
      return url.searchParams.get("id") || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function getGoogleDrivePreviewUrl(value?: string | null) {
  const fileId = getGoogleDriveFileId(value);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : undefined;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]+$/;

export type MenuMediaProvider = "Google Drive" | "YouTube" | "Instagram" | "Facebook";

export function getMenuMediaEmbed(
  value?: string | null,
  facebookWidth = 500,
): { embedUrl: string; provider: MenuMediaProvider } | undefined {
  const drivePreviewUrl = getGoogleDrivePreviewUrl(value);
  if (drivePreviewUrl) return { embedUrl: drivePreviewUrl, provider: "Google Drive" };
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(hostname)) {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const videoId =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["embed", "shorts", "live"].includes(pathParts[0] ?? "")
            ? pathParts[1]
            : undefined;
      if (videoId && YOUTUBE_ID.test(videoId)) {
        return {
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
          provider: "YouTube",
        };
      }
    }
    if (hostname === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      if (videoId && YOUTUBE_ID.test(videoId)) {
        return {
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
          provider: "YouTube",
        };
      }
    }
    if (hostname === "instagram.com") {
      const [kind, shortcode] = url.pathname.split("/").filter(Boolean);
      if (
        ["p", "reel", "reels", "tv"].includes(kind ?? "") &&
        shortcode &&
        INSTAGRAM_CODE.test(shortcode)
      ) {
        const normalizedKind = kind === "reels" ? "reel" : kind;
        return {
          embedUrl: `https://www.instagram.com/${normalizedKind}/${shortcode}/embed/`,
          provider: "Instagram",
        };
      }
    }
    if (["facebook.com", "m.facebook.com", "web.facebook.com"].includes(hostname)) {
      const isFacebookVideo =
        /^\/(?:reel|share\/(?:v|r))\/[A-Za-z0-9._-]+(?:\/|$)/.test(url.pathname) ||
        /^\/[^/]+\/videos\/[A-Za-z0-9._-]+(?:\/|$)/.test(url.pathname) ||
        (["/watch", "/video.php"].includes(url.pathname.replace(/\/+$/, "")) &&
          Boolean(url.searchParams.get("v")));
      if (isFacebookVideo) {
        const playerWidth = Math.max(220, Math.min(750, Math.round(facebookWidth)));
        return {
          embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false&width=${playerWidth}`,
          provider: "Facebook",
        };
      }
    }
    if (hostname === "fb.watch" && /^\/[A-Za-z0-9._-]+(?:\/|$)/.test(url.pathname)) {
      const playerWidth = Math.max(220, Math.min(750, Math.round(facebookWidth)));
      return {
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false&width=${playerWidth}`,
        provider: "Facebook",
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function normalizeMediaUrls(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function getMenuMediaUrls(menu?: {
  mediaUrls?: string[];
  googleDriveUrl?: string | null;
  googleDriveUrls?: string[];
}) {
  if (!menu) return [];
  return normalizeMediaUrls([
    ...(menu.mediaUrls ?? []),
    ...(menu.googleDriveUrls ?? []),
    ...(menu.googleDriveUrl ? [menu.googleDriveUrl] : []),
  ]);
}
