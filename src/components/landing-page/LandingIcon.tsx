import type { CSSProperties } from "react";

// Curated local icons keep storefront controls usable offline and without a CDN.
const paths: Record<string, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
  chat: "M21 11a9 9 0 0 1-9 9H3l2-4a9 9 0 1 1 16-5Z",
  monitor: "M3 3h18v13H3V3Zm9 13v5m-5 0h10",
  tablet: "M5 2h14v20H5V2Zm6 17h2",
  smartphone: "M7 2h10v20H7V2Zm4 17h2",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  copy: "M8 8h13v13H8V8ZM3 16V3h13",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  heart: "M12 21 3 12C-2 5 6-1 12 6c6-7 14-1 9 6l-9 9Z",
};
const names: Record<string, string> = {
  "hamburger-menu": "menu",
  magnifer: "search",
  "bag-4": "bag",
  "chat-round": "chat",
  "eye-closed": "eye",
  "trash-bin-trash": "trash",
  "star-fall": "star",
  "shop-2": "bag",
  "notebook-bookmark": "package",
  "gallery-wide": "home",
  "text-square": "package",
  "shield-check": "shield",
  widget: "package",
  gallery: "home",
  "question-circle": "chat",
  "phone-calling": "chat",
  cursor: "pin",
  "cursor-square": "pin",
  copyright: "home",
  "palette-round": "star",
};
export function LandingIcon({
  icon,
  className,
  style,
}: {
  icon: string;
  className?: string;
  style?: CSSProperties;
}) {
  const stem = icon.replace(/^solar:/, "").replace(/-linear$/, "");
  const name = names[stem] ?? stem;
  if (paths[name])
    return (
      <svg
        aria-hidden="true"
        className={className}
        style={style}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={paths[name]} />
      </svg>
    );
  return (
    <img
      aria-hidden="true"
      className={className}
      style={{ width: 20, height: 20, ...style }}
      src={`/landing-assets/icons/${name}.svg`}
      alt=""
    />
  );
}
