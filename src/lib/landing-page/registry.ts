import { createLandingComponent, type LandingPageComponentType } from "@/types/landing-page";
import { blockLayouts } from "./schema";
export const blockRegistry: Record<
  LandingPageComponentType,
  {
    label: string;
    group: "Content" | "Commerce" | "Media" | "Navigation";
    icon: string;
    layouts: string[];
    motion: boolean;
    create: () => ReturnType<typeof createLandingComponent>;
  }
> = Object.fromEntries(
  [
    ["HEADER", "Header", "Navigation", "solar:hamburger-menu-linear", ["CENTERED", "SPLIT"], false],
    [
      "HERO",
      "Hero",
      "Content",
      "solar:star-fall-linear",
      ["LEGACY", "POSTER", "COLLAGE", "ARCHITECTURAL", "PHOTO_STRIP", "LANDSCAPE_BANNER"],
      true,
    ],
    ["TEXT", "Text", "Content", "solar:text-square-linear", ["CENTERED", "SPLIT"], true],
    ["CATALOG", "Product catalog", "Commerce", "solar:shop-2-linear", ["GRID", "RAIL"], true],
    ["MENU", "Menu", "Commerce", "solar:notebook-bookmark-linear", ["GRID", "RAIL"], true],
    [
      "MEDIA_STORY",
      "Media story",
      "Media",
      "solar:gallery-wide-linear",
      ["STORY", "LOOKBOOK", "PORTAL"],
      true,
    ],
    ["FEATURES", "Features", "Content", "solar:shield-check-linear", ["GRID", "RAIL"], true],
    ["SHOWCASE", "Showcase", "Content", "solar:widget-linear", ["GRID", "OFFERING_PATHS"], true],
    ["GALLERY", "Gallery", "Media", "solar:gallery-linear", ["GRID", "RAIL", "COLLAGE"], true],
    ["TESTIMONIALS", "Testimonials", "Content", "solar:chat-round-linear", ["GRID", "RAIL"], true],
    ["FAQ", "Questions", "Content", "solar:question-circle-linear", ["GRID"], false],
    ["CONTACT", "Contact", "Content", "solar:phone-calling-linear", ["SPLIT", "CENTERED"], false],
    ["CTA", "Call to action", "Content", "solar:cursor-square-linear", ["CENTERED", "SPLIT"], true],
    ["FOOTER", "Footer", "Navigation", "solar:copyright-linear", ["CENTERED", "SPLIT"], false],
  ].map(([type, label, group, icon, _layouts, motion]) => [
    type,
    {
      label,
      group,
      icon,
      layouts: [...blockLayouts[type as LandingPageComponentType]],
      motion,
      create: () => createLandingComponent(type as LandingPageComponentType),
    },
  ]),
) as typeof blockRegistry;
