import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getMenuMediaEmbed, getMenuMediaUrls } from "@/lib/google-drive";
import { formatPeso } from "@/lib/utils";
import type { MenuItem } from "@/types/domain";

type MenuViewDialogProps = {
  menu?: MenuItem;
  onOpenChange: (open: boolean) => void;
};

export function MenuViewDialog({ menu, onOpenChange }: MenuViewDialogProps) {
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(500);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const mediaUrls = getMenuMediaUrls(menu);
  const currentMediaUrl = mediaUrls[mediaIndex];
  const media = getMenuMediaEmbed(currentMediaUrl, mediaWidth);
  const facebookPlayerHeight = Math.ceil((mediaWidth * 16) / 9) + 72;

  useEffect(() => {
    if (!currentMediaUrl) return;
    const container = mediaContainerRef.current;
    if (!container) return;

    const updateWidth = () => setMediaWidth(container.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [currentMediaUrl]);

  return (
    <Dialog open={Boolean(menu)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <div className="pr-10">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{menu?.name ?? "Menu item"}</DialogTitle>
            {menu ? (
              <Badge tone={menu.isAvailable ? "green" : "neutral"}>
                {menu.isAvailable ? "AVAILABLE" : "PAUSED"}
              </Badge>
            ) : null}
          </div>
          <DialogDescription>
            {menu?.menuCode} · {formatPeso(menu?.sellingPricePerServing ?? 0)} per serving
          </DialogDescription>
        </div>

        {media ? (
          <div className="mt-5 space-y-3">
            <div
              ref={mediaContainerRef}
              className="overflow-hidden rounded-2xl border border-pink-100 bg-stone-950"
            >
              <iframe
                src={media.embedUrl}
                title={`${menu?.name ?? "Menu item"} media`}
                style={media.provider === "Facebook" ? { height: facebookPlayerHeight } : undefined}
                className={
                  media.provider === "Facebook"
                    ? "w-full"
                    : media.provider === "Instagram"
                      ? "h-[min(72vh,720px)] w-full"
                      : "h-[min(65vh,560px)] w-full"
                }
                allow="autoplay; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mediaIndex === 0}
                  onClick={() => setMediaIndex((index) => Math.max(0, index - 1))}
                >
                  <Icon icon="solar:alt-arrow-left-linear" /> Previous
                </Button>
                <span className="min-w-16 text-center text-xs font-semibold text-stone-500">
                  {mediaIndex + 1} of {mediaUrls.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mediaIndex >= mediaUrls.length - 1}
                  onClick={() =>
                    setMediaIndex((index) => Math.min(mediaUrls.length - 1, index + 1))
                  }
                >
                  Next <Icon icon="solar:alt-arrow-right-linear" />
                </Button>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={currentMediaUrl ?? media.embedUrl} target="_blank" rel="noreferrer">
                  <Icon icon="solar:square-arrow-right-up-linear" /> Open on {media.provider}
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid min-h-56 place-items-center rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-6 text-center">
            <div>
              <Icon icon="solar:gallery-wide-linear" className="mx-auto size-12 text-pink-300" />
              <p className="mt-3 font-semibold text-stone-700">No media added</p>
              <p className="mt-1 text-sm text-stone-500">
                Edit this menu item and add a Drive, YouTube, Instagram, or Facebook link.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
