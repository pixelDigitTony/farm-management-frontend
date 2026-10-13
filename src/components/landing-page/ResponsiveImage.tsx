import { type ImgHTMLAttributes, useSyncExternalStore } from "react";
import { StoredImage } from "@/components/StoredImage";

const query = "(max-width:767px)";
const subscribe = (notify: () => void) => {
  const media = matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => matchMedia(query).matches;

// Resolve the selected source through StoredImage, including authenticated draft media.
// A raw <source srcSet="/api/images/..."> bypasses that loader on mobile.
export function ResponsiveImage({
  mobileSrc,
  src,
  srcSet,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { mobileSrc?: string }) {
  const mobile = useSyncExternalStore(subscribe, snapshot, () => false);
  const selected = mobile && mobileSrc ? mobileSrc : src;
  return (
    <picture>
      <StoredImage
        {...props}
        key={selected}
        src={selected}
        srcSet={mobile && mobileSrc ? undefined : srcSet}
        onLoad={(event) => {
          event.currentTarget.classList.remove("lp-image-failed");
          event.currentTarget.style.visibility = "";
          props.onLoad?.(event);
        }}
      />
    </picture>
  );
}
