export type LandingPageTheme = {
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  fontStyle: "MODERN" | "CLASSIC";
  buttonStyle: "ROUNDED" | "PILL" | "SQUARE";
};

export type LandingPageComponentType = "HERO" | "TEXT" | "MENU" | "GALLERY" | "CONTACT" | "CTA";
export type LandingPageComponentWidth = "FULL" | "TWO_THIRDS" | "HALF" | "THIRD";
export type LandingPageSectionContentWidth = "FULL" | "WIDE" | "CONTAINED";
export type LandingPageSectionSpacing = "NONE" | "SMALL" | "MEDIUM" | "LARGE";

type BaseComponent<T extends LandingPageComponentType, C> = {
  id: string;
  type: T;
  enabled: boolean;
  width: LandingPageComponentWidth;
  content: C;
};

export type HeroComponent = BaseComponent<
  "HERO",
  {
    eyebrow: string;
    title: string;
    body: string;
    mediaUrl: string;
    primaryLabel: string;
    primaryUrl: string;
    secondaryLabel: string;
    secondaryUrl: string;
  }
>;
export type TextComponent = BaseComponent<
  "TEXT",
  { heading: string; body: string; alignment: "LEFT" | "CENTER" }
>;
export type MenuComponent = BaseComponent<
  "MENU",
  { heading: string; body: string; menuItemIds: string[]; columns: 2 | 3 | 4 }
>;
export type GalleryComponent = BaseComponent<
  "GALLERY",
  { heading: string; mediaUrls: string[]; columns: 2 | 3 | 4 }
>;
export type ContactComponent = BaseComponent<
  "CONTACT",
  {
    heading: string;
    body: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    facebookUrl: string;
    instagramUrl: string;
    mapUrl: string;
  }
>;
export type CtaComponent = BaseComponent<
  "CTA",
  { heading: string; body: string; buttonLabel: string; buttonUrl: string }
>;

export type LandingPageComponent =
  | HeroComponent
  | TextComponent
  | MenuComponent
  | GalleryComponent
  | ContactComponent
  | CtaComponent;

export type LandingPageSection = {
  id: string;
  name: string;
  enabled: boolean;
  backgroundColor: string;
  textColor: string;
  contentWidth: LandingPageSectionContentWidth;
  padding: LandingPageSectionSpacing;
  gap: LandingPageSectionSpacing;
  components: LandingPageComponent[];
};

export type LandingPageVariant = {
  _id: string;
  name: string;
  theme: LandingPageTheme;
  sections: LandingPageSection[];
  createdAt?: string;
  updatedAt?: string;
};

export type LandingPageVariantPayload = Omit<LandingPageVariant, "sections"> & {
  sections?: LandingPageSection[];
  components?: LandingPageComponent[];
};

export type LandingPageRecord = {
  _id: string;
  slug: string;
  siteTitle: string;
  seoDescription: string;
  isPublished: boolean;
  publishedVariantId?: string;
  publishedAt?: string;
};

export type LandingMenuItem = {
  _id: string;
  name: string;
  category?: string;
  mediaUrls?: string[];
  googleDriveUrl?: string;
  googleDriveUrls?: string[];
  sellingPricePerServing?: string;
  isAvailable?: boolean;
};

export type LandingPageBuilderData = {
  page: LandingPageRecord | null;
  variants: LandingPageVariant[];
  menuItems: LandingMenuItem[];
};

export function createLandingComponent(type: LandingPageComponentType): LandingPageComponent {
  const base = { id: crypto.randomUUID(), enabled: true, width: "FULL" as const };
  if (type === "HERO")
    return {
      ...base,
      type,
      content: {
        eyebrow: "Welcome",
        title: "Your headline",
        body: "Share what makes your business special.",
        mediaUrl: "",
        primaryLabel: "Contact us",
        primaryUrl: "#contact",
        secondaryLabel: "",
        secondaryUrl: "",
      },
    };
  if (type === "TEXT")
    return {
      ...base,
      type,
      content: { heading: "Your story", body: "Add your message here.", alignment: "LEFT" },
    };
  if (type === "MENU")
    return {
      ...base,
      type,
      content: { heading: "Featured menu", body: "", menuItemIds: [], columns: 3 },
    };
  if (type === "GALLERY")
    return { ...base, type, content: { heading: "Gallery", mediaUrls: [], columns: 3 } };
  if (type === "CONTACT")
    return {
      ...base,
      type,
      content: {
        heading: "Contact us",
        body: "",
        address: "",
        phone: "",
        email: "",
        hours: "",
        facebookUrl: "",
        instagramUrl: "",
        mapUrl: "",
      },
    };
  return {
    ...base,
    type: "CTA",
    content: {
      heading: "Ready to order?",
      body: "Get in touch with us today.",
      buttonLabel: "Contact us",
      buttonUrl: "#contact",
    },
  };
}

export function createLandingSection(
  name = "New section",
  components: LandingPageComponent[] = [],
): LandingPageSection {
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    backgroundColor: "",
    textColor: "",
    contentWidth: "WIDE",
    padding: "MEDIUM",
    gap: "MEDIUM",
    components,
  };
}

export function normalizeLandingSections(source: {
  sections?: LandingPageSection[];
  components?: LandingPageComponent[];
}): LandingPageSection[] {
  if (source.sections?.length) return source.sections;
  return [
    {
      id: "legacy-main-section",
      name: "Main section",
      enabled: true,
      backgroundColor: "",
      textColor: "",
      contentWidth: "WIDE",
      padding: "MEDIUM",
      gap: "MEDIUM",
      components: source.components ?? [],
    },
  ];
}

export function normalizeLandingPageVariant(
  variant: LandingPageVariantPayload,
): LandingPageVariant {
  return { ...variant, sections: normalizeLandingSections(variant) };
}
